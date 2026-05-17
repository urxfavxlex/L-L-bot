const discordTranscripts = require('discord-html-transcripts');
const blockedWords = require('./blockedWords.json');
const db = require('./database');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
    Client,
    Collection,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionsBitField
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();

const activeAutoJails = new Set();
const activeUnjails = new Set();

client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    client.user.setPresence({
        activities: [{
            name: 'watching users become staff problems',
            type: 3
        }],
        status: 'online'
    });
});

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
}

async function createJailChannel(guild, member, staffRoleId, jailCategoryId, jailedRoleId, reason) {

    let jailChannel = guild.channels.cache.find(
        ch => ch.name === `jail-${member.user.username.toLowerCase()}`
    );

    if (jailChannel) return jailChannel;

    jailChannel = await guild.channels.create({
        name: `jail-${member.user.username.toLowerCase()}`,
        type: 0,
        parent: jailCategoryId,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: ['ViewChannel']
            },
            {
                id: jailedRoleId,
                deny: ['ViewChannel']
            },
            {
                id: member.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            },
            {
                id: staffRoleId,
                allow: [
                    'ViewChannel',
                    'SendMessages',
                    'ReadMessageHistory',
                    'ManageMessages',
                    'AttachFiles'
                ]
            }
        ]
    });

    const jailEmbed = new EmbedBuilder()
        .setTitle('Jail')
        .setDescription(
            'Get jailed nerd. A member of staff will be with you shortly.'
        )
        .addFields({
            name: 'Reason',
            value: reason
        })
        .setColor('#ff4da6');

    const jailButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`claim_jail_${member.id}`)
            .setLabel('Claim')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`close_jail_${member.id}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
    );

    await jailChannel.send({
        content: `${member} <@&${staffRoleId}>`,
        embeds: [jailEmbed],
        components: [jailButtons]
    });

    return jailChannel;
}

client.on('interactionCreate', async interaction => {

    try {

        if (interaction.isButton()) {

            if (interaction.customId.startsWith('claim_jail_')) {

                return interaction.reply({
                    content: `🔒 | ${interaction.user} claimed this jail.`,
                    ephemeral: false
                });
            }

            if (interaction.customId.startsWith('close_jail_')) {

                return interaction.reply({
                    content: `🔒 | Use >close to close this jail.`,
                    ephemeral: true
                });
            }

            if (interaction.customId === 'open_verify_ticket') {

                const existingChannel = interaction.guild.channels.cache.find(
                    ch => ch.name === `verify-${interaction.user.username.toLowerCase()}`
                );

                if (existingChannel) {
                    return interaction.reply({
                        content: 'You already have an open verification ticket.',
                        ephemeral: true
                    });
                }

                const channel = await interaction.guild.channels.create({
                    name: `verify-${interaction.user.username.toLowerCase()}`,
                    type: 0,
                    parent: process.env.VERIFY_CATEGORY_ID,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel']
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                'ViewChannel',
                                'SendMessages',
                                'ReadMessageHistory',
                                'AttachFiles'
                            ]
                        }
                    ]
                });

                return interaction.reply({
                    content: `Verification ticket opened: ${channel}`,
                    ephemeral: true
                });
            }
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        await command.execute(interaction);

    } catch (error) {

        console.error(error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'There was an error.',
                ephemeral: true
            }).catch(() => {});
        } else {
            await interaction.reply({
                content: 'There was an error.',
                ephemeral: true
            }).catch(() => {});
        }
    }
});

client.on('messageCreate', async message => {

    if (message.author.bot) return;
    if (!message.guild) return;

    const jailedRoleId = process.env.JAILED_ROLE_ID;
    const jailCategoryId = process.env.JAIL_CATEGORY_ID;
    const staffRoleId = '1371005644638912542';

    // CLOSE

    if (message.content.startsWith('>close')) {

        if (!message.channel.name.startsWith('jail-')) {
            return message.reply('This is not a jail channel.');
        }

        await message.channel.delete().catch(() => {});
        return;
    }

    // JAIL

    if (message.content.startsWith('>jail')) {

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('No permission.');
        }

        const member = message.mentions.members.first();

        if (!member) {
            return message.reply('Mention a user.');
        }

        const reason =
            message.content.split(' ').slice(2).join(' ') ||
            'No reason provided';

        const jailedRole = message.guild.roles.cache.get(jailedRoleId);

        if (!jailedRole) {
            return message.reply('Jailed role missing.');
        }

        if (member.roles.cache.has(jailedRoleId)) {
            return message.reply('Already jailed.');
        }

        const savedRoles = member.roles.cache
            .filter(role =>
                role.id !== message.guild.id &&
                role.id !== jailedRoleId &&
                !role.managed
            )
            .map(role => role.id);

        db.prepare(`
            INSERT OR REPLACE INTO jailed_users (user_id, roles)
            VALUES (?, ?)
        `).run(member.id, JSON.stringify(savedRoles));

        const botMember = message.guild.members.me;

        const rolesToRemove = member.roles.cache.filter(role =>
            role.id !== message.guild.id &&
            role.id !== jailedRoleId &&
            !role.managed &&
            role.position < botMember.roles.highest.position
        );

        await member.roles.remove(rolesToRemove).catch(() => {});
        await member.roles.add(jailedRole).catch(() => {});

        if (member.voice.channel) {
            await member.voice.disconnect().catch(() => {});
        }

        const jailChannel = await createJailChannel(
            message.guild,
            member,
            staffRoleId,
            jailCategoryId,
            jailedRoleId,
            reason
        );

        return message.channel.send(
            `🚨 | Sent ${member} to jail [${jailChannel}]`
        );
    }

    // UNJAIL

    if (message.content.startsWith('>unjail')) {

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('No permission.');
        }

        const member = message.mentions.members.first();

        if (!member) {
            return message.reply('Mention a user.');
        }

        if (activeUnjails.has(member.id)) return;

        activeUnjails.add(member.id);

        await message.channel.send(
            `🔓 ${member} is being unjailed...`
        );

        await member.roles.remove(jailedRoleId).catch(() => {});

        const row = db.prepare(`
            SELECT roles FROM jailed_users
            WHERE user_id = ?
        `).get(member.id);

        if (row) {

            const roles = JSON.parse(row.roles);

            for (const roleId of roles) {
                await member.roles.add(roleId).catch(() => {});
            }

            db.prepare(`
                DELETE FROM jailed_users
                WHERE user_id = ?
            `).run(member.id);
        }

        const jailChannels = message.guild.channels.cache.filter(
            ch => ch.name === `jail-${member.user.username.toLowerCase()}`
        );

        for (const channel of jailChannels.values()) {
            await channel.delete().catch(() => {});
        }

        await message.channel.send(
            `✅ | Released ${member} from jail.`
        );

        setTimeout(() => {
            activeUnjails.delete(member.id);
        }, 5000);

        return;
    }

    // IGNORE COMMANDS

    if (message.content.startsWith('>')) return;

    // AUTOMOD

    const content = message.content.toLowerCase();

    const matchedWord = blockedWords.find(word =>
        content.includes(word.toLowerCase())
    );

    if (!matchedWord) return;

    const autoMember = message.member;

    if (!autoMember) return;

    if (activeAutoJails.has(autoMember.id)) return;

    activeAutoJails.add(autoMember.id);

    await message.delete().catch(() => {});

    const jailedRole = message.guild.roles.cache.get(jailedRoleId);

    if (!jailedRole) return;

    const savedRoles = autoMember.roles.cache
        .filter(role =>
            role.id !== message.guild.id &&
            !role.managed
        )
        .map(role => role.id);

    db.prepare(`
        INSERT OR REPLACE INTO jailed_users (user_id, roles)
        VALUES (?, ?)
    `).run(autoMember.id, JSON.stringify(savedRoles));

    const botMember = message.guild.members.me;

    const rolesToRemove = autoMember.roles.cache.filter(role =>
        role.id !== message.guild.id &&
        role.id !== jailedRoleId &&
        !role.managed &&
        role.position < botMember.roles.highest.position
    );

    await autoMember.roles.remove(rolesToRemove).catch(() => {});
    await autoMember.roles.add(jailedRole).catch(() => {});

    await createJailChannel(
        message.guild,
        autoMember,
        staffRoleId,
        jailCategoryId,
        jailedRoleId,
        `Automod: ${matchedWord}`
    );

    setTimeout(() => {
        activeAutoJails.delete(autoMember.id);
    }, 5000);
});

client.login(process.env.DISCORD_TOKEN);