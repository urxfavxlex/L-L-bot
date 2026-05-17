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
    EmbedBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton()) {
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

                const verifyCategoryId = process.env.VERIFY_CATEGORY_ID;

                const channel = await interaction.guild.channels.create({
                    name: `verify-${interaction.user.username.toLowerCase()}`,
                    type: 0,
                    parent: verifyCategoryId,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'] }
                    ]
                });

                const verifyButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_verify_${interaction.user.id}`)
                        .setLabel('Approve')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_verify_${interaction.user.id}`)
                        .setLabel('Deny')
                        .setStyle(ButtonStyle.Danger)
                );

                await channel.send({
                    content: `${interaction.user}, please send your verification photo/info here. Staff will review it shortly.`,
                    components: [verifyButtons]
                });

                return interaction.reply({
                    content: `Verification ticket opened: ${channel}`,
                    ephemeral: true
                });
            }

            if (interaction.customId.startsWith('approve_verify_')) {
                const userId = interaction.customId.replace('approve_verify_', '');
                const member = await interaction.guild.members.fetch(userId).catch(() => null);

                if (!member) {
                    return interaction.reply({ content: 'User not found.', ephemeral: true });
                }

                if (!process.env.VERIFIED_ROLE_ID) {
                    return interaction.reply({ content: 'VERIFIED_ROLE_ID is missing from .env', ephemeral: true });
                }

                await member.roles.add(process.env.VERIFIED_ROLE_ID);

                await interaction.reply({
                    content: `${member} has been verified.`,
                    ephemeral: true
                });

                await interaction.channel.send(`✅ ${member} has been approved and verified.`).catch(() => {});
               
                const logChannel = interaction.guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);

                if (logChannel) {
                    const attachment = await discordTranscripts.createTranscript(interaction.channel, {
                        limit: 100,
                        returnType: 'attachment',
                        filename: `${interaction.channel.name}.html`
                    });

                    await logChannel.send({
                        content: `📁 Verification transcript for ${member.user.tag}`,
                        files: [attachment]
                    });
                }

                setTimeout(() => {
                    interaction.channel.delete().catch(() => {});
                }, 5000);

                return;
            }
            if (interaction.customId.startsWith('deny_verify_')) {
                await interaction.reply({
                    content: 'Verification denied.',
                    ephemeral: true
                });

                const logChannel = interaction.guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);

                if (logChannel) {
                    const attachment = await discordTranscripts.createTranscript(interaction.channel, {
                        limit: 100,
                        returnType: 'attachment',
                        filename: `${interaction.channel.name}.html`
                    });

                    await logChannel.send({
                        content: `📁 Verification transcript for ${interaction.channel.name}`,
                        files: [attachment]
                    });
                }

                await interaction.channel.send('❌ Verification denied.').catch(() => {});

                setTimeout(() => {
                    interaction.channel.delete().catch(() => {});
                }, 5000);

                return;
            }

            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        await command.execute(interaction);
    } catch (error) {
        console.error(error);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error executing this interaction.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error executing this interaction.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Could not send error reply:', replyError.message);
        }
    }
});

client.on('messageCreate', async message => {
    console.log(`Saw message: ${message.content}`);

    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.content.startsWith('>close')) {

    if (!message.channel.name.startsWith('jail-')) {
        return message.reply('This is not a jail channel.');
    }

    const logChannel = message.guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);

    const attachment = await discordTranscripts.createTranscript(message.channel, {
        limit: -1,
        returnType: 'attachment',
        filename: `${message.channel.name}.html`
    });

    if (logChannel) {
        const transcriptEmbed = new EmbedBuilder()
            .setTitle('Jail Closed')
            .setDescription(
                `**Channel:** ${message.channel.name}\n` +
                `**Closed By:** ${message.author}`
            )
            .setColor('#ff4da6')
            .setTimestamp();

        await logChannel.send({
            embeds: [transcriptEmbed],
            files: [attachment]
        });
    }

    await message.channel.send('🔒 | Closing jail in 3 seconds...');

    setTimeout(async () => {
        await message.channel.delete().catch(() => {});
    }, 3000);

    return;
}
    if (message.content.startsWith('>jail')) {
    if (!message.member.permissions.has('ManageRoles')) {
        return message.reply('You do not have permission to jail members.');
    }

    const member = message.mentions.members.first();
    const reason = message.content.split(' ').slice(2).join(' ') || 'No reason provided';

    if (!member) {
        return message.reply('Please mention a user to jail.');
    }

    const jailedRoleId = process.env.JAILED_ROLE_ID;
    const jailCategoryId = process.env.JAIL_CATEGORY_ID;
    const staffRoleId = '1371005644638912542';

    const jailedRole = message.guild.roles.cache.get(jailedRoleId);

    if (!jailedRole) {
        return message.reply('Jailed role not found.');
    }

    if (member.roles.cache.has(jailedRoleId)) {
        return message.reply(`${member} is already jailed.`);
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
    let jailChannel = message.guild.channels.cache.find(
        ch => ch.name === `jail-${member.user.username.toLowerCase()}`
    );

    if (!jailChannel) {
        jailChannel = await message.guild.channels.create({
            name: `jail-${member.user.username.toLowerCase()}`,
            type: 0,
            parent: jailCategoryId,
            permissionOverwrites: [
    {
        id: message.guild.id,
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
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages', 'AttachFiles']
    }
]
        });
    }

    const jailEmbed = new EmbedBuilder()
        .setTitle('Jail')
        .setDescription('Get jailed nerd. A member of the staff team will be with you shortly, please be patient heathen.')
        .addFields(
            { name: 'Reason', value: reason }
        )
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
    }

    return message.channel.send(`🚨 | Sent ${member} to jail [${jailChannel}].`);

if (message.content.startsWith('>unjail')) {
    if (!message.member.permissions.has('ManageRoles')) {
        return message.reply('You do not have permission to unjail members.');
    }

    const member = message.mentions.members.first();

    await message.channel.send(`🔓 ${member} is being unjailed...`);

    if (!member) {
        return message.reply('Please mention a user to unjail.');
    }

    const jailedRoleId = process.env.JAILED_ROLE_ID;

    await member.roles.remove(jailedRoleId).catch(err => {
        console.error('Could not remove jailed role:', err);
    });

    const row = db.prepare(`
        SELECT roles FROM jailed_users
        WHERE user_id = ?
    `).get(member.id);

    if (row) {
        const roles = JSON.parse(row.roles);

        for (const roleId of roles) {
            try {
                await member.roles.add(roleId);
            } catch (err) {
                console.log(`Could not restore role ${roleId}: ${err.message}`);
            }
        }

        db.prepare(`
            DELETE FROM jailed_users
            WHERE user_id = ?
        `).run(member.id);
    }

    const jailChannels = message.guild.channels.cache.filter(
        ch => ch.name === `jail-${member.user.username.toLowerCase()}`
    );

    const logChannel = message.guild.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);

    for (const channel of jailChannels.values()) {
    const attachment = await discordTranscripts.createTranscript(channel, {
        limit: -1,
        returnType: 'attachment',
        filename: `${channel.name}.html`
    });

    if (logChannel) {
        const transcriptEmbed = new EmbedBuilder()
            .setTitle('Ticket Closed')
            .setDescription(
                `**Name:** ${channel.name}\n\n` +
                `__**Owner**__\n` +
                `ID: ${member.id}\n` +
                `Mention: ${member}\n` +
                `Display Name: ${member.displayName}\n\n` +
                `__**Closed By**__\n` +
                `ID: ${message.author.id}\n` +
                `Mention: ${message.author}\n` +
                `Display Name: ${message.member.displayName}\n\n` +
                `__**Close Reason**__\n` +
                `No reason provided.`
            )
            .setColor('#ff4da6')
            .setTimestamp();

        await logChannel.send({
            embeds: [transcriptEmbed],
            files: [attachment]
        });
    }

    if (message.channel) {
        await message.channel.send(`✅ | Released ${member} from jail.`);
    }

    return;
}

if (message.content.startsWith('>')) return;

const content = message.content.toLowerCase();
console.log('Checking automod content:', content);

const matchedWord = blockedWords.find(word =>
    content.includes(word.toLowerCase())
);

if (!matchedWord) return;

await message.delete().catch(() => {});

const jailCategoryId = process.env.JAIL_CATEGORY_ID;
const staffRoleId = '1371005644638912542';

const member = message.member;
const jailedRole = message.guild.roles.cache.get(jailedRoleId);

if (!member || !jailedRole) return;

const savedRoles = member.roles.cache
    .filter(role =>
        role.id !== message.guild.id &&
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

let jailChannel = message.guild.channels.cache.find(
    ch => ch.name === `jail-${member.user.username.toLowerCase()}`
);

if (!jailChannel) {
    jailChannel = await message.guild.channels.create({
        name: `jail-${member.user.username.toLowerCase()}`,
        type: 0,
        parent: jailCategoryId,
        permissionOverwrites: [
            {
                id: message.guild.id,
                deny: ['ViewChannel']
            },
            {
                id: member.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            },
            {
                id: staffRoleId,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages', 'AttachFiles']
            }
        ]
    });
}

const jailEmbed = new EmbedBuilder()
    .setTitle('Jail')
    .setDescription('Get jailed nerd. A member of the staff team will be with you shortly, please be patient heathen.')
    .addFields(
        { name: 'Reason', value: `Automod: ${matchedWord}` }
    )
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

}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('claim_jail_')) {
        await interaction.reply({
            content: `🔒 | ${interaction.user} claimed this jail.`,
            ephemeral: false
        });
    }

    if (interaction.customId.startsWith('close_jail_')) {
    await interaction.reply({
        content: `🔒 | Use >close to close this jail.`,
        ephemeral: true
    });
}
});
});
client.login(process.env.DISCORD_TOKEN);