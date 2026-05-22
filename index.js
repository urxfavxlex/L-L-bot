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

const activeVerifications = new Set();
const STAFF_ROLE_ID = '1371005644638912542';

const VERIFIED_FEMALE_ROLE_ID = '1371005088084000778';
const VERIFIED_MALE_ROLE_ID = '1371005022707515463';

const VERIFIED_OTHER_ROLE_ID = '1371005166576341002';

const ID_VERIFIED_ROLE_ID = '1390387442401542440';
const CROSS_VERIFIED_ROLE_ID = '1370618146544943165';

const UNVERIFIED_ROLE_ID = '1250655963401289740';

const VERIFY_CATEGORY_ID = '1370642326422028298';
const VERIFY_LOG_CHANNEL_ID = '1370630712935583744';

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

function verifyChannelName(member, type) {
    return `${type}-verify-${member.user.username.toLowerCase()}`;
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

async function sendTicketTranscript(channel, closedBy, type, logChannelId) {

    const logChannel =
        channel.guild.channels.cache.get(logChannelId);

        console.log('TRANSCRIPT DEBUG:', {
    type,
    logChannelId,
    foundChannel: logChannel?.name,
    foundChannelId: logChannel?.id
});

   if (!logChannel) {
    console.log('TRANSCRIPT FAILED: log channel not found', {
        type,
        logChannelId
    });
    return;
}
    const attachment =
        await discordTranscripts.createTranscript(
            channel,
            {
                limit: -1,
                returnType: 'attachment',
                filename: `${channel.name}.html`,
                saveImages: true,
                poweredBy: false
            }
        );

    const embed = new EmbedBuilder()
        .setTitle(`${type} Transcript`)
        .setColor(
            type === 'Jail'
                ? '#ff4da6'
                : '#B22959'
        )
        .addFields(
            {
                name: 'Channel',
                value: `${channel.name}`,
                inline: false
            },
            {
                name: 'Closed By',
                value: `${closedBy}`,
                inline: false
            },
            {
                name: 'Closed At',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: false
            }
        )
        .setTimestamp();

    await logChannel.send({
    embeds: [embed],
    files: [attachment]
}).then(() => {

    console.log('TRANSCRIPT SENT:', {
        type,
        channel: logChannel.name,
        channelId: logChannel.id
    });

}).catch(err => {

    console.error(
        'TRANSCRIPT SEND ERROR:',
        err
    );

});
}

async function closeJailChannel(channel, closedBy) {

    await sendTicketTranscript(
        channel,
        closedBy,
        'Jail',
        process.env.MOD_LOG_CHANNEL_ID
    ).catch(err => {
        console.error(
            'Jail transcript error:',
            err
        );    });

    await channel.delete().catch(() => {});
}

// ─── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});

            if (
                interaction.customId === 'open_id_verify' ||
                interaction.customId === 'open_cross_verify'
            ) {
                const type = interaction.customId === 'open_id_verify' ? 'id' : 'cross';

                const existingChannel = interaction.guild.channels.cache.find(
                    ch => ch.name === verifyChannelName(interaction.member, type)
                );

                if (existingChannel) {
                    return interaction.editReply({
                        content: `You already have an open verification ticket: ${existingChannel}`
                    }).catch(() => {});
                }

                const channel = await interaction.guild.channels.create({
                    name: verifyChannelName(interaction.member, type),
                    type: ChannelType.GuildText,
                    parent: VERIFY_CATEGORY_ID,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel']
                        },
                        {
                            id: interaction.member.id,
                            allow: [
                                'ViewChannel',
                                'SendMessages',
                                'ReadMessageHistory',
                                'AttachFiles'
                            ]
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

                let embed;

if (type === 'id') {

    embed = new EmbedBuilder()
        .setTitle('<a:VerifiedBabyPink:1504450035096621127> 𝗜𝗗 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻')
        .setDescription(
            `## How to ID verify:\n` +
            `• Write today’s date, the server name, and your username on a piece of paper.\n` +
            `• Send a picture of the paper and your ID with no filters. Blur out any sensitive information except your date of birth and picture.\n` +
            `• Then send a selfie holding both the ID and paper.\n` +
            `• After staff confirms your verification, you may delete your pictures.\n\n` +

            `**Valid identification only.**\n\n` +

            `## Requirements:\n` +
            `• All sensitive information must be blurred except your DOB and picture.\n` +
            `• No filters, emojis, edits, or effects. We need clear pictures.`
        )
        .setColor('#ffb6d9')
        .setTimestamp();

} else {

    let embed;

if (type === 'id') {

    embed = new EmbedBuilder()
        .setTitle('<a:VerifiedBabyPink:1504450035096621127> 𝗜𝗗 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻')
        .setDescription(
            `## How to ID verify:\n` +
            `• Write today’s date, the server name, and your username on a piece of paper.\n` +
            `• Send a picture of the paper and your ID with no filters. Blur out any sensitive information except your date of birth and picture.\n` +
            `• Then send a selfie holding both the ID and paper.\n` +
            `• After staff confirms your verification, you may delete your pictures.\n\n` +

            `**Valid identification only.**\n\n` +

            `## Requirements:\n` +
            `• All sensitive information must be blurred except your DOB and picture.\n` +
            `• No filters, emojis, edits, or effects. We need clear pictures.`
        )
        .setColor('#ffb6d9')
        .setTimestamp();

} else {

    embed = new EmbedBuilder()
        .setTitle('<a:crossblueverified:1507266654999154801> 𝗖𝗿𝗼𝘀𝘀 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻')
        .setDescription(
            `Send a screenshot of your roles from one of our trusted servers.\n\n` +

            `One of our staff members will then ask you for a customized pose that you must complete and send in ⁠unknown.\n\n` +

            `## Please note:\n` +
            `• You cannot be cross verified here if the server you are coming from also accepted cross verification. We only allow ID verified members from trusted servers to cross verify here.\n` +
            `• No editing of screenshots or pictures is allowed. If we suspect editing, we will verify your roles directly with the server you joined from.\n` +
            `• Once staff confirms your verification, you may delete your pictures.\n\n` +

            `## What do you get?\n` +
            `Our Cross Verified role, access to all chats, events, daily challenges, roles, and of course our NSFW category.`
        )
        .setColor('#8ecbff')
        .setTimestamp();
}
}

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`claim_verify_${interaction.member.id}`)
                        .setLabel('Claim')
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId(`vc_verify_${interaction.member.id}`)
                        .setLabel('VC Verify')
                        .setEmoji('🎙️')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(`close_verify_${interaction.member.id}`)
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Danger)
                );

                await channel.send({
                    content: `${interaction.member} <@&${STAFF_ROLE_ID}>`,
                    embeds: [embed],
                    components: [row]
                });

                return interaction.editReply({
                    content: `✅ | Your verification ticket has been created: ${channel}`
                }).catch(() => {});
            }

            const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);

            if (!isStaff) {
                return interaction.editReply({
                    content: 'No permission.'
                }).catch(() => {});
            }

            if (interaction.customId.startsWith('claim_verify_')) {
                await interaction.deleteReply().catch(() => {});
                return interaction.channel.send(
                    `🔒 | ${interaction.user} claimed this verification ticket.`
                ).catch(() => {});
            }

            if (interaction.customId.startsWith('vc_verify_')) {
                await interaction.deleteReply().catch(() => {});
                return interaction.channel.send(
                    `🎙️ | ${interaction.user} marked this ticket for VC verification.`
                ).catch(() => {});
            }

            if (interaction.customId.startsWith('close_verify_')) {
                await interaction.editReply({
                    content: '🔒 | Saving transcript and closing verification ticket...'
                }).catch(() => {});

                await interaction.channel.send(
                    '🔒 | Saving transcript and closing verification ticket...'
                ).catch(() => {});

                await sendTicketTranscript(
                    interaction.channel,
                    interaction.user,
                    'Verification',
                    VERIFY_LOG_CHANNEL_ID
                ).catch(err => {
                    console.error('Verification transcript error:', err);
                });

                const channelToDelete = interaction.channel;

                setTimeout(async () => {
                await channelToDelete?.delete().catch(() => {});
                }, 3000);

                return;
            }

            if (interaction.customId.startsWith('claim_jail_')) {
                await interaction.deleteReply().catch(() => {});
                return interaction.channel.send(
                    `🔒 | ${interaction.user} claimed this jail.`
                ).catch(() => {});
            }

            if (interaction.customId.startsWith('close_jail_')) {
                return interaction.editReply({
                    content: `🔒 | Use ${PREFIX}close inside this jail channel to close it.`
                }).catch(() => {});
            }

            if (interaction.customId.startsWith('copyroles_')) {
                const targetId = interaction.customId.split('_')[1];

                const guildMember = await interaction.guild.members
                    .fetch(targetId)
                    .catch(() => null);

                if (!guildMember) {
                    return interaction.editReply({
                        content: 'User not found.'
                    }).catch(() => {});
                }

                const ids = guildMember.roles.cache
                    .filter(role => role.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(role => role.id)
                    .join(', ');

                return interaction.editReply({
                    content: `📋 Role IDs:\n\`\`\`\n${ids || 'No roles'}\n\`\`\``
                }).catch(() => {});
            }

            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        await command.execute(interaction);

    } catch (error) {
        console.error('Interaction error:', error);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error handling this interaction.',
                    ephemeral: true
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content: 'There was an error handling this interaction.',
                    ephemeral: true
                }).catch(() => {});
            }
        } catch {}
    }
});

// ─── Message Handler ───────────────────────────────────────────────────────────

client.on('messageCreate', async message => {
    try {
        if (message.author.bot) return;
        if (!message.guild) return;

        const jailedRoleId = process.env.JAILED_ROLE_ID;
        const jailedRole = message.guild.roles.cache.get(jailedRoleId);

// CLOSE
if (message.content.startsWith(`${PREFIX}close`)) {

    if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
        return message.reply(
            'You do not have permission to close jails.'
        );
    }

    if (
        !message.channel ||
        !message.channel.name?.startsWith('jail-')
    ) {
        return message.reply(
            'This is not a jail channel.'
        );
    }

    const channelToClose = message.channel;

    await channelToClose.send(
        '🔒 | Saving transcript and closing jail...'
    ).catch(() => {});

    await closeJailChannel(
        channelToClose,
        message.author
    );

    return;
}

// UNJAIL
        if (message.content.startsWith(`${PREFIX}unjail`)) {
            if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply('You do not have permission to unjail members.');
            }

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
                await message.channel.send(`🔓 ${member} is being unjailed...`).catch(() => {});
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
                await message.channel.send(`✅ | Released ${member} from jail.`).catch(() => {});
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

            const jailKey = `${message.guild.id}-${member.id}`;

            if (activeJails.has(jailKey)) return;

            activeJails.add(jailKey);

            const args = message.content.trim().split(/\s+/);
            const reason = args.slice(2).join(' ') || 'No reason provided';

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
                activeJails.delete(jailKey);
            }, 5000);

            return;
        }

        // VERIFY PANEL

if (message.content.startsWith(`${PREFIX}verify`)) {

    if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
        return message.reply('No permission.');
    }

    const embed = new EmbedBuilder()
        .setTitle('୨୧・Verification System・୨୧')
        .setDescription(
            'Welcome to **Leather & Lace** verification.\n\n' +
            '💕 **Cross Verification**\n' +
            '💙 **ID Verification**\n\n' +
            'Please check trusted servers before choosing cross verification.\n\n' +
            'Click a button below to open a verification ticket.\n\n' +
            'Staff will assist you as soon as possible.'
        )
        .setColor('#B22959')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId('open_id_verify')
            .setLabel('ID Verify')
            .setEmoji('🪪')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('open_cross_verify')
            .setLabel('Cross Verify')
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Secondary)
    );

    return message.channel.send({
        embeds: [embed],
        components: [row]
    });
}
        
// ID VERIFY STAFF COMMAND
if (message.content.startsWith(`${PREFIX}idv`)) {

    const verifyKey = `idv-${message.id}`;
    if (activeVerifications.has(verifyKey)) return;

    activeVerifications.add(verifyKey);

    setTimeout(() => {
        activeVerifications.delete(verifyKey);
    }, 5000);

    if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
        return message.reply('No permission.');
    }

    const args = message.content.trim().split(/ +/);
    const member = message.mentions.members.first();

    if (!member) {
    return message.reply('Usage: ,idv @user f/m/o');
}

    const gender = args[2]?.toLowerCase();

    let genderRole;

    if (gender === 'f') genderRole = VERIFIED_FEMALE_ROLE_ID;
    if (gender === 'm') genderRole = VERIFIED_MALE_ROLE_ID;
    if (gender === 'o') genderRole = VERIFIED_OTHER_ROLE_ID;

    console.log('IDV command ran');
    console.log('Target:', member?.user?.tag);
    console.log('Gender arg:', args[2]);
    console.log('ID role:', ID_VERIFIED_ROLE_ID);
    console.log('Gender role:', genderRole);
    console.log('Bot highest role:', message.guild.members.me.roles.highest.name);

    if (!genderRole) {
    return message.reply('Use f, m, or o.');
}

  try {
    await member.roles.add(ID_VERIFIED_ROLE_ID);
    await member.roles.add(genderRole);
    await member.roles.remove(UNVERIFIED_ROLE_ID);

    return message.channel.send(
        `✅ | ${member} has been ID verified.`
    );
} catch (err) {
    console.error('IDV role error:', err);
    return message.reply(`Role error: ${err.message}`);
}
}

// CROSS VERIFY STAFF COMMAND
if (message.content.startsWith(`${PREFIX}cv`)) {

    const verifyKey = `cv-${message.id}`;

    if (activeVerifications.has(verifyKey)) return;

    activeVerifications.add(verifyKey);

    setTimeout(() => {
        activeVerifications.delete(verifyKey);
    }, 5000);

    if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
        return message.reply('No permission.');
    }

    const args = message.content.trim().split(/ +/);

    const member = message.mentions.members.first();

    if (!member) {
        return message.reply('Usage: ,cv @user f/m/o');
    }

    const gender = args[2]?.toLowerCase();

    let genderRole;

    if (gender === 'f') genderRole = VERIFIED_FEMALE_ROLE_ID;
    if (gender === 'm') genderRole = VERIFIED_MALE_ROLE_ID;
    if (gender === 'o') genderRole = VERIFIED_OTHER_ROLE_ID;

    if (!genderRole) {
        return message.reply('Use f, m, or o.');
    }

    try {

        await member.roles.add(ID_VERIFIED_ROLE_ID);

        await member.roles.add(CROSS_VERIFIED_ROLE_ID);

        await member.roles.add(genderRole);

        await member.roles.remove(UNVERIFIED_ROLE_ID);

    } catch (err) {

        console.error('CV role error:', err);

        return message.reply(
            `Role error: ${err.message}`
        );
    }

    return message.channel.send(
        `✅ | ${member} has been cross verified.`
    );
}

// USERINFO
        if (message.content.startsWith(`${PREFIX}userinfo`)) {
            const args = message.content.trim().split(/ +/);

            const member =
                message.mentions.members.first() ||
                message.guild.members.cache.get(args[1]) ||
                message.member;

            const roles = member.roles.cache
                .filter(role => role.id !== message.guild.id)
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString());

            const createdTimestamp = Math.floor(member.user.createdTimestamp / 1000);
            const joinedTimestamp = Math.floor(member.joinedTimestamp / 1000);

            const boosting = member.premiumSince
                ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
                : 'Not Boosting';

            const perms = [];

            if (member.permissions.has(PermissionsBitField.Flags.Administrator)) perms.push('Administrator');
            if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) perms.push('Manage Server');
            if (member.permissions.has(PermissionsBitField.Flags.ManageRoles)) perms.push('Manage Roles');
            if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) perms.push('Manage Channels');
            if (member.permissions.has(PermissionsBitField.Flags.BanMembers)) perms.push('Ban Members');
            if (member.permissions.has(PermissionsBitField.Flags.KickMembers)) perms.push('Kick Members');
            if (member.permissions.has(PermissionsBitField.Flags.ManageMessages)) perms.push('Manage Messages');

            const embed = new EmbedBuilder()
                .setColor('#B22959')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setDescription(
                    `# User Info • ${member.displayName}\n\n` +
                    `**User:** ${member.user.tag}\n` +
                    `**Mention:** ${member}\n` +
                    `**ID:** \`${member.id}\`\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `## Member Info\n\n` +
                    `**Nickname:** ${member.nickname || 'None'}\n` +
                    `**Color:** ${member.displayHexColor}\n` +
                    `**Boosting:** ${boosting}\n\n` +
                    `**Joined Server:**\n<t:${joinedTimestamp}:F>\n<t:${joinedTimestamp}:R>\n\n` +
                    `**Account Created:**\n<t:${createdTimestamp}:F>\n<t:${createdTimestamp}:R>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `## Significant Permissions\n\n` +
                    `${perms.length ? perms.join('\n') : 'None'}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `## Roles (${roles.length})\n\n` +
                    `${roles.length ? roles.join(', ') : 'No roles'}`
                )
                .setFooter({
                    text: `Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`copyroles_${member.id}`)
                    .setLabel('Copy Role IDs')
                    .setEmoji('📋')
                    .setStyle(ButtonStyle.Secondary)
            );

            return message.reply({
                embeds: [embed],
                components: [row]
            }).catch(() => {});
        }

// IGNORE OTHER PREFIX COMMANDS
        if (message.content.startsWith(PREFIX)) return;

// AUTOMOD
const content = message.content.toLowerCase();

const automodWhitelist = [
    'therapist',
    'therapy',
    'grape',
    'grapes',
    'scrap',
    'scrape'
];

if (automodWhitelist.some(word => content.includes(word))) return;

const matchedWord = blockedWords.find(word => {

    const cleanWord = word.trim().toLowerCase();

    const escaped = cleanWord.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
    );

    const regex = new RegExp(
        `\\b${escaped}\\b`,
        'i'
    );

    return regex.test(content);
});

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
