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
    PermissionsBitField,
    ChannelType
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

const PREFIX = ',';

const activeJails = new Set();
const activeAutoJails = new Set();
const activeUnjails = new Set();

const STAFF_ROLE_ID = '1371005644638912542';

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

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (command?.data?.name) {
            client.commands.set(command.data.name, command);
        }
    }
}

function jailChannelName(member) {
    return `jail-${member.user.username.toLowerCase()}`;
}

async function saveRoles(member, jailedRoleId) {
    const savedRoles = member.roles.cache
        .filter(role =>
            role.id !== member.guild.id &&
            role.id !== jailedRoleId &&
            !role.managed
        )
        .map(role => role.id);

    db.prepare(`
        INSERT OR REPLACE INTO jailed_users (user_id, roles)
        VALUES (?, ?)
    `).run(member.id, JSON.stringify(savedRoles));
}

async function removeRolesAndJail(member, jailedRole) {
    const botMember = member.guild.members.me;

    const rolesToRemove = member.roles.cache.filter(role =>
        role.id !== member.guild.id &&
        role.id !== jailedRole.id &&
        !role.managed &&
        role.position < botMember.roles.highest.position
    );

    await member.roles.remove(rolesToRemove).catch(() => {});
    await member.roles.add(jailedRole).catch(() => {});

    if (member.voice?.channel) {
        await member.voice.disconnect().catch(() => {});
    }
}

async function createOrGetJailChannel(guild, member, reason) {
    const jailedRoleId = process.env.JAILED_ROLE_ID;
    const jailCategoryId = process.env.JAIL_CATEGORY_ID;

    await guild.channels.fetch().catch(() => {});

    let jailChannel = guild.channels.cache.find(
        ch => ch.name === jailChannelName(member)
    );

    if (jailChannel) {
        return jailChannel;
    }

    jailChannel = await guild.channels.create({
        name: jailChannelName(member),
        type: ChannelType.GuildText,
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
                id: STAFF_ROLE_ID,
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
        .setDescription('Get jailed nerd. A member of staff will be with you shortly.')
        .addFields({
            name: 'Reason',
            value: reason
        })
        .setColor('#ff4da6')
        .setTimestamp();

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
        content: `${member} <@&${STAFF_ROLE_ID}>`,
        embeds: [jailEmbed],
        components: [jailButtons]
    });

    return jailChannel;
}

async function closeJailChannel(channel, closedBy) {
    const logChannel = channel.guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);

    if (logChannel) {
        const attachment = await discordTranscripts.createTranscript(channel, {
            limit: -1,
            returnType: 'attachment',
            filename: `${channel.name}.html`
        });

        const embed = new EmbedBuilder()
            .setTitle('Jail Transcript')
            .setDescription(
                `**Channel:** ${channel.name}\n` +
                `**Closed By:** ${closedBy}`
            )
            .setColor('#ff4da6')
            .setTimestamp();

        await logChannel.send({
            embeds: [embed],
            files: [attachment]
        }).catch(() => {});
    }

    await channel.delete().catch(() => {});
}

client.on('interactionCreate', async interaction => {
    try {

        if (interaction.isButton()) {

            if (interaction.customId.startsWith('claim_jail_')) {
              return interaction.reply({
    content: `🔒 | ${interaction.user} claimed this jail.`,
    ephemeral: false
}).catch(() => {}); 
            }

            if (interaction.customId.startsWith('close_jail_')) {
                return interaction.reply({
    content: `🔒 | Use ${PREFIX}close inside this jail channel to close it.`,
    ephemeral: true
}).catch(() => {});
            }

            return;
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

    try {

        if (message.author.bot) return;
        if (!message.guild) return;

        const jailedRoleId = process.env.JAILED_ROLE_ID;
        const jailedRole = message.guild.roles.cache.get(jailedRoleId);

        // CLOSE

        if (message.content.startsWith(`${PREFIX}close`)) {

    if (!message.channel || !message.channel.name?.startsWith('jail-')) {
        return message.reply('This is not a jail channel.');
    }

    const channelToClose = message.channel;

    await channelToClose.send(
        '🔒 | Saving transcript and closing jail...'
    ).catch(() => {});

    setTimeout(async () => {
        await closeJailChannel(channelToClose, message.author);
    }, 1500);

    return;
}
        // UNJAIL

        if (message.content.startsWith(`${PREFIX}unjail`)) {

            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return message.reply('No permission.');
            }

            const member = message.mentions.members.first();

            if (!member) {
                return message.reply('Mention a user.');
            }

            const lockKey = `${message.guild.id}-${member.id}`;
            
            if (activeUnjails.has(lockKey)) return;
            
            activeUnjails.add(lockKey);

            if (message.channel) {
    await message.channel.send(
        `🔓 ${member} is being unjailed...`
    ).catch(() => {});
}
            await member.roles.remove(jailedRoleId).catch(() => {});

            const row = db.prepare(`
                SELECT roles FROM jailed_users
                WHERE user_id = ?
            `).get(member.id);

            if (row) {

                const roles = JSON.parse(row.roles);

               await member.roles.add(roles).catch(() => {});

                db.prepare(`
                    DELETE FROM jailed_users
                    WHERE user_id = ?
                `).run(member.id);
            }

           if (message.channel) {
    await message.channel.send(
        `✅ | Released ${member} from jail.`
    ).catch(() => {});
}
            setTimeout(() => {
            activeUnjails.delete(lockKey);
            }, 5000);

            return;
        }

        // JAIL

        if (message.content.startsWith(`${PREFIX}jail`)) {

            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return message.reply('No permission.');
            }

            const member = message.mentions.members.first();

            if (!member) {
                return message.reply('Mention a user.');
            }

            if (!jailedRole) {
                return message.reply('Jailed role missing.');
            }

            if (member.roles.cache.has(jailedRoleId)) {
                return message.reply('Already jailed.');
            }

            if (activeJails.has(member.id)) return;

            activeJails.add(member.id);

            const args = message.content.trim().split(/\s+/);
            const reason = args.slice(2).join(' ') || 'No reason provided';
                message.content.split(' ').slice(2).join(' ') ||
                'No reason provided';

            await saveRoles(member, jailedRoleId);

            await removeRolesAndJail(member, jailedRole);

            const jailChannel = await createOrGetJailChannel(
                message.guild,
                member,
                reason
            );

            await message.channel.send(
                `🚨 | Sent ${member} to jail [${jailChannel}]`
            ).catch(() => {});

            setTimeout(() => {
                activeJails.delete(member.id);
            }, 5000);

            return;
        }

        // IGNORE COMMANDS

        if (message.content.startsWith(PREFIX)) return;

        // AUTOMOD

        const content = message.content.toLowerCase();

        const matchedWord = blockedWords.find(word =>
            content.includes(word.toLowerCase())
        );

        if (!matchedWord) return;

        const member = message.member;

        if (!member || !jailedRole) return;

        if (member.roles.cache.has(jailedRoleId)) return;

        if (activeAutoJails.has(member.id)) return;

        activeAutoJails.add(member.id);

        await message.delete().catch(() => {});

        await saveRoles(member, jailedRoleId);

        await removeRolesAndJail(member, jailedRole);

        await createOrGetJailChannel(
            message.guild,
            member,
            `Automod: ${matchedWord}`
        );

        setTimeout(() => {
            activeAutoJails.delete(member.id);
        }, 5000);

    } catch (error) {

        console.error('Message handler error:', error);

    }
});

client.login(process.env.DISCORD_TOKEN);