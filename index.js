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

const TRUSTED_SERVERS_CHANNEL_ID = '1391263294312157265';

const VERIFIED_FEMALE_ROLE_ID = '1371005088084000778';
const VERIFIED_MALE_ROLE_ID = '1371005022707515463';

const VERIFIED_OTHER_ROLE_ID = '1371005166576341002';

const ID_VERIFIED_ROLE_ID = '1390387442401542440';
const CROSS_VERIFIED_ROLE_ID = '1370618146544943165';

const UNVERIFIED_ROLE_ID = '1250655963401289740';

const VERIFY_CATEGORY_ID = '1370642326422028298';
const VERIFY_LOG_CHANNEL_ID = '1370630712935583744';

const SUPPORT_CATEGORY_ID = '1371998685583507486';
const PARTNERSHIP_CATEGORY_ID = '1507292226957344819';
const COUNCIL_CATEGORY_ID = '1391302172041285692';

const SUPPORT_LOG_CHANNEL_ID = '1507294987165892608';
const PARTNERSHIP_LOG_CHANNEL_ID = '1507295204275916821';
const COUNCIL_LOG_CHANNEL_ID = '1391301818692145222';

const PARTNERSHIP_MANAGER_ROLE_ID = '1507292432767782973';
const ADMIN_ROLE_ID = '1371004354680848385';
const SERVER_MANAGER_ROLE_ID = '1371000386432925717';
const COUNCIL_ROLE_ID = '1391303718665850960';

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

function ticketChannelName(member, type) {
    return `${type}-${member.user.username.toLowerCase()}`;
}

function hasAnyRole(member, roleIds) {
    return roleIds.some(roleId => member.roles.cache.has(roleId));
}

const ticketConfigs = {
    support: {
        label: 'Support',
        emoji: '<:3121staff:1507298065583837274>',
        categoryId: SUPPORT_CATEGORY_ID,
        logChannelId: SUPPORT_LOG_CHANNEL_ID,
        pingRoles: [STAFF_ROLE_ID],
        allowedCloseRoles: [STAFF_ROLE_ID],
        color: '#B22959',
        panelTitle: 'Support Tickets',
        panelDescription:
            `Need help with something? Open a support ticket below and a staff member will assist you as soon as possible. Whether it’s questions, concerns, reports, role issues, partnership help, or anything else, we’ve got you.\n\n` +
            `For minor issues or quick reports, please use /report with Sapphire instead of opening a ticket.\n\n` +
            `Please be patient after opening a ticket and avoid pinging staff repeatedly. Include as much detail as possible so we can help faster.`,
        ticketTitle: 'Support Ticket Opened',
        ticketDescription:
            `Thank you for opening a support ticket! Please explain your issue in detail below so staff can assist you faster.\n\n` +
            `Helpful things to include:\n` +
            `• What happened\n` +
            `• Usernames/IDs involved\n` +
            `• Screenshots or proof if applicable\n` +
            `• What you need help with\n\n` +
            `Please be patient while waiting for a response and avoid pinging staff repeatedly. A staff member will be with you as soon as possible.`
    },

    partnership: {
        label: 'Partnership',
        emoji: '<:partner_LL:1507299122728927303>',
        categoryId: PARTNERSHIP_CATEGORY_ID,
        logChannelId: PARTNERSHIP_LOG_CHANNEL_ID,
        pingRoles: [
            ADMIN_ROLE_ID,
            SERVER_MANAGER_ROLE_ID,
            COUNCIL_ROLE_ID,
            PARTNERSHIP_MANAGER_ROLE_ID
        ],
        allowedCloseRoles: [
            ADMIN_ROLE_ID,
            SERVER_MANAGER_ROLE_ID,
            COUNCIL_ROLE_ID,
            PARTNERSHIP_MANAGER_ROLE_ID
        ],
        color: '#B22959',
        panelTitle: 'Partnership Tickets',
        panelDescription:
            `Interested in partnering with Leather & Lace? Open a partnership ticket below and our team will review your server as soon as possible.\n\n` +
            `Please make sure your server follows Discord ToS and is active before applying. Trusted partnerships may receive additional perks depending on activity, reputation, and community safety.\n\n` +
            `When opening a ticket, please include:\n` +
            `• Your server invite\n` +
            `• Member count\n` +
            `• What type of partnership you’re looking for\n` +
            `• Your server ad/banner\n` +
            `• Any important information you’d like us to know\n\n` +
            `Please be patient while waiting for a response from our team.`,
        ticketTitle: 'Partnership Ticket Opened',
        ticketDescription:
            `Thank you for opening a partnership ticket! Please provide the following information below so our team can review your request faster:\n\n` +
            `• Server invite link\n` +
            `• Member count\n` +
            `• Partnership type requested\n` +
            `• Your advertisement/banner\n` +
            `• Brief description of your server/community\n` +
            `• Any questions or extra information\n\n` +
            `One of our staff members will review your request as soon as possible. Please avoid pinging staff while waiting.`
    },

    council: {
        label: 'Council',
        emoji: '<a:purplesiren:1507300456299233350>',
        categoryId: COUNCIL_CATEGORY_ID,
        logChannelId: COUNCIL_LOG_CHANNEL_ID,
        pingRoles: [COUNCIL_ROLE_ID],
        allowedCloseRoles: [COUNCIL_ROLE_ID],
        color: '#B22959',
        panelTitle: 'Council Tickets',
        panelDescription:
            `Council tickets are reserved for extremely serious situations only. This includes reports involving staff members, major safety concerns, abuse of power, severe harassment, privacy concerns, or situations that cannot safely be handled through normal support tickets.\n\n` +
            `Do not open council tickets for minor reports, role requests, drama, or basic support questions. For smaller issues, please use /report with Sapphire or open a normal support ticket instead.\n\n` +
            `All council tickets are handled privately by Council and upper management.`,
        ticketTitle: 'Council Ticket Opened',
        ticketDescription:
            `Thank you for opening a council ticket. Please explain the situation in as much detail as possible below.\n\n` +
            `Please include:\n` +
            `• What happened\n` +
            `• Users/staff involved\n` +
            `• Screenshots, message links, or proof\n` +
            `• Dates/times if relevant\n` +
            `• Any previous actions already taken\n\n` +
            `These tickets are reviewed carefully due to the severity of the reports involved. Please remain respectful and patient while Council reviews the situation. Avoid pinging staff unless additional urgent information needs to be added.`
    }
};

async function createTicketChannel(
    interaction,
    type
) {

    const config = ticketConfigs[type];

    const existingChannel =
        interaction.guild.channels.cache.find(
            ch => ch.name === ticketChannelName(
                interaction.member,
                type
            )
        );

    if (existingChannel) {

       return interaction.followUp({
    content:
        `You already have an open ${config.label.toLowerCase()} ticket: ${existingChannel}`,
    ephemeral: true
}).catch(() => {});
    }

    const permissionOverwrites = [

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
        }
    ];

    for (const roleId of config.pingRoles) {

        permissionOverwrites.push({
            id: roleId,
            allow: [
                'ViewChannel',
                'SendMessages',
                'ReadMessageHistory',
                'ManageMessages',
                'AttachFiles'
            ]
        });
    }

    const channel =
        await interaction.guild.channels.create({

            name: ticketChannelName(
                interaction.member,
                type
            ),

            type: ChannelType.GuildText,

            parent: config.categoryId,

            permissionOverwrites
        });

    const embed = new EmbedBuilder()
        .setTitle(config.ticketTitle)
        .setDescription(config.ticketDescription)
        .setColor(config.color)
        .setTimestamp();

    const row =
        new ActionRowBuilder().addComponents(

            new ButtonBuilder()
                .setCustomId(
                    `claim_ticket_${type}`
                )
                .setLabel('Claim')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(
                    `close_ticket_${type}`
                )
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger)
        );

    const rolePings =
        config.pingRoles
            .map(roleId => `<@&${roleId}>`)
            .join(' ');

    await channel.send({

        content:
            `${interaction.member} ${rolePings}`,

        embeds: [embed],

        components: [row]
    });

    return interaction.followUp({
        content: `✅ | Your ${config.label.toLowerCase()} ticket has been created: ${channel}`,
        ephemeral: true
    }).catch(() => {});
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
    .setTitle('Ticket Closed')
    .setColor(
        type === 'Jail'
            ? '#249fe6'
            : '#B22959'
    )
    .setDescription(
        `**ID:** \`${channel.id}\`\n` +
        `**Name:** ${channel.name}\n\n` +

        `__**Closed By**__\n` +
        `ID: \`${closedBy.id}\`\n` +
        `Mention: ${closedBy}\n` +
        `Display Name: ${closedBy.tag || closedBy.username}\n\n` +

        `__**Close Reason**__\n` +
        `No reason provided.\n\n` +

        `**Closed On:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setTimestamp();

    await logChannel.send({
    embeds: [embed],
    files: [attachment]
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

      // no defer needed

            // OPEN VERIFY TICKETS
            if (
                interaction.customId === 'open_id_verify' ||
                interaction.customId === 'open_cross_verify'
            ) {

                const type =
                    interaction.customId === 'open_id_verify'
                        ? 'id'
                        : 'cross';

                const existingChannel =
                    interaction.guild.channels.cache.find(
                        ch => ch.name === verifyChannelName(
                            interaction.member,
                            type
                        )
                    );

                if (existingChannel) {
                    return interaction.followUp({
                        content: `You already have an open verification ticket: ${existingChannel}`,
                        ephemeral: true
                    }).catch(() => {});
                }

                const channel =
                    await interaction.guild.channels.create({

                        name: verifyChannelName(
                            interaction.member,
                            type
                        ),

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

                const embed = new EmbedBuilder()
                    .setTitle(
                        type === 'id'
                            ? '𝗜𝗗 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻'
                            : '𝗖𝗿𝗼𝘀𝘀 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻'
                    )
                    .setDescription(
                        type === 'id'
                            ? 'Please send your ID verification information below.'
                            : 'Please send your cross verification information below.'
                    )
                    .setColor(
                        type === 'id'
                            ? '#ffb6d9'
                            : '#8ecbff'
                    )
                    .setTimestamp();

                const row =
                    new ActionRowBuilder().addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `claim_verify_${interaction.member.id}`
                            )
                            .setLabel('Claim')
                            .setStyle(ButtonStyle.Primary),

                        new ButtonBuilder()
                            .setCustomId(
                                `vc_verify_${interaction.member.id}`
                            )
                            .setLabel('VC Verify')
                            .setEmoji('🎙️')
                            .setStyle(ButtonStyle.Success),

                        new ButtonBuilder()
                            .setCustomId(
                                `close_verify_${interaction.member.id}`
                            )
                            .setLabel('Close')
                            .setStyle(ButtonStyle.Danger)
                    );

                await channel.send({
                    content:
                        `${interaction.member} <@&${STAFF_ROLE_ID}>`,
                    embeds: [embed],
                    components: [row]
                });

               return interaction.followUp({
                    content: `✅ | Your verification ticket has been created: ${channel}`,
                    ephemeral: true
                }).catch(() => {});
            }

            // OPEN SUPPORT/PARTNERSHIP/COUNCIL
            if (
                interaction.customId === 'open_support_ticket' ||
                interaction.customId === 'open_partnership_ticket' ||
                interaction.customId === 'open_council_ticket'
            ) {

                const type =
                    interaction.customId
                        .replace('open_', '')
                        .replace('_ticket', '');

                return createTicketChannel(
                    interaction,
                    type
                );
            }

            const isStaff =
                interaction.member.roles.cache.has(
                    STAFF_ROLE_ID
                );

            if (!isStaff) {
                return interaction.followUp({
                    content: 'No permission.'
                }).catch(() => {});
            }

            // CLAIM TICKETS
            if (
                interaction.customId.startsWith(
                    'claim_ticket_'
                )
            ) {

               await interaction.followUp({
                content: '✅ | Claimed.'
                }).catch(() => {});

                return interaction.channel.send(
                    `🔒 | ${interaction.user} claimed this ticket.`
                ).catch(() => {});
                            }

            // CLOSE TICKETS
if (interaction.customId.startsWith('close_ticket_')) {
    const type = interaction.customId.replace('close_ticket_', '');
    const config = ticketConfigs[type];

    if (!config) {
        return interaction.followUp({
            content: 'Ticket config not found.'
        }).catch(() => {});
    }

    await interaction.followUp({
        content: `🔒 | Saving transcript and closing ${config.label.toLowerCase()} ticket...`
    }).catch(() => {});

    await interaction.channel.send(
        `🔒 | Saving transcript and closing ${config.label.toLowerCase()} ticket...`
    ).catch(() => {});

    await sendTicketTranscript(
        interaction.channel,
        interaction.user,
        config.label,
        config.logChannelId
    ).catch(err => {
        console.error(`${config.label} transcript error:`, err);
    });

    const channelToDelete = interaction.channel;

    setTimeout(async () => {
        await channelToDelete?.delete().catch(() => {});
    }, 3000);

    return;
}

// CLAIM VERIFY
            if (
                interaction.customId.startsWith(
                    'claim_verify_'
                )
            ) {

                await interaction.followUp({
                    content: '✅ | Claimed.'
                }).catch(() => {});

                return interaction.channel.send(
                    `🔒 | ${interaction.user} claimed this ticket.`
                ).catch(() => {});
            }
            // VC VERIFY
            if (
                interaction.customId.startsWith(
                    'vc_verify_'
                )
            ) {

                await interaction.followUp({
                    content: '✅ | Claimed.'
                }).catch(() => {});

                return interaction.channel.send(
                    `🎙️ | ${interaction.user} marked this ticket for VC verification.`
                ).catch(() => {});
            }

            // CLOSE VERIFY
            if (
                interaction.customId.startsWith(
                    'close_verify_'
                )
            ) {

                await interaction.followUp({
                    content:
                        '🔒 | Saving transcript and closing verification ticket...'
                }).catch(() => {});

                return;
            }

            // CLAIM JAIL
            if (
                interaction.customId.startsWith(
                    'claim_jail_'
                )
            ) {

                await interaction.followUp({
                    content: '✅ | Claimed.'
                }).catch(() => {});

                return interaction.channel.send(
                    `🔒 | ${interaction.user} claimed this jail.`
                ).catch(() => {});
            }

            // CLOSE JAIL
            if (
                interaction.customId.startsWith(
                    'close_jail_'
                )
            ) {

                return interaction.followUp({
                    content:
                        `🔒 | Use ${PREFIX}close inside this jail channel to close it.`
                }).catch(() => {});
            }

            // COPY ROLES
            if (
                interaction.customId.startsWith(
                    'copyroles_'
                )
            ) {

                const targetId =
                    interaction.customId.split('_')[1];

                const guildMember =
                    await interaction.guild.members
                        .fetch(targetId)
                        .catch(() => null);

                if (!guildMember) {
                    return interaction.followUp({
                        content: 'User not found.'
                    }).catch(() => {});
                }

                const ids =
                    guildMember.roles.cache
                        .filter(
                            role =>
                                role.id !== interaction.guild.id
                        )
                        .sort(
                            (a, b) =>
                                b.position - a.position
                        )
                        .map(role => role.id)
                        .join(', ');

                return interaction.followUp({
                    content:
                        `📋 Role IDs:\n\`\`\`\n${ids || 'No roles'}\n\`\`\``
                }).catch(() => {});
            }

            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command =
            client.commands.get(
                interaction.commandName
            );

        if (!command) return;

        await command.execute(interaction);

    } catch (error) {

        console.error(
            'Interaction error:',
            error
        );

        try {

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                await interaction.followUp({
                    content:
                        'There was an error handling this interaction.',
                    ephemeral: true
                }).catch(() => {});

            } else {

                await interaction.reply({
                    content:
                        'There was an error handling this interaction.',
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
            '<a:crossblueverified:1507266654999154801> **Cross Verification**\n' +
            '<a:VerifiedBabyPink:1504450035096621127> **ID Verification**\n\n' +
            'Please check trusted servers before choosing cross verification.\n' +
            '<#1391263294312157265>\n\n' +
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

    if (!genderRole) {
    return message.reply('Use f, m, or o.');
}

  try {
    await member.roles.add(ID_VERIFIED_ROLE_ID);
    await member.roles.add(genderRole);
    await member.roles.remove(UNVERIFIED_ROLE_ID);

    return message.channel.send({
    embeds: [
        new EmbedBuilder()
            .setColor('#B22959')
            .setDescription(
                `I’m gonna leave this open for about 5 minutes so you can grab all your roles before I close everything out.\n\n` +

                `**Main Roles:** <#1250673806108917770>\n` +
                `**NSFW Roles:** <#1370301378601156618>\n` +
                `**Color Roles:** <#1503561264855777391>\n` +
                `**Server Map:** <#1504425608170704966>\n` +
                `**Rules:** <#1348580499962073098>\n` +
                `**NSFW Rules & Access:** <#1504446626176176129>\n\n` +

                `🚨 **MAKE SURE YOU GRAB YOUR DM ROLES. THEY ARE REQUIRED.** 🚨\n\n` +

                `Do you have any questions before I close everything out?\n\n` +

                `Welcome to Leather & Lace!!! Thank you for verifying\n` +
                `<a:ggbikinibottom:1254825377075953694> ` +
                `<a:happy:1372396099024851025> ` +
                `<a:ggbikinibottom:1254825331211374624>`
            )
            .setTimestamp()
    ]
});

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

    return message.channel.send({
    embeds: [
        new EmbedBuilder()
            .setColor('#B22959')
            .setDescription(
                 `I’m gonna leave this open for about 5 minutes so you can grab all your roles before I close everything out.\n\n` +

                `**Main Roles:** <#1250673806108917770>\n` +
                `**NSFW Roles:** <#1370301378601156618>\n` +
                `**Color Roles:** <#1503561264855777391>\n` +
                `**Server Map:** <#1504425608170704966>\n` +
                `**Rules:** <#1348580499962073098>\n` +
                `**NSFW Rules & Access:** <#1504446626176176129>\n\n` +

                `🚨 **MAKE SURE YOU GRAB YOUR DM ROLES. THEY ARE REQUIRED.** 🚨\n\n` +

                `Do you have any questions before I close everything out?\n\n` +

                `Welcome to Leather & Lace!!! Thank you for verifying\n` +
                `<a:ggbikinibottom:1254825377075953694> ` +
                `<a:happy:1372396099024851025> ` +
                `<a:ggbikinibottom:1254825331211374624>`
            )
            .setTimestamp()
    ]
});
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

        // TICKET PANELS
if (
    message.content.startsWith(`${PREFIX}supportpanel`) ||
    message.content.startsWith(`${PREFIX}partnershippanel`) ||
    message.content.startsWith(`${PREFIX}councilpanel`)
) {

    if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
        return message.reply('No permission.');
    }

    const type = message.content
        .replace(PREFIX, '')
        .replace('panel', '')
        .trim();

    const config = ticketConfigs[type];

    if (!config) return;

    const embed = new EmbedBuilder()
        .setTitle(`${config.emoji} ${config.panelTitle}`)
        .setDescription(config.panelDescription)
        .setColor(config.color)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`open_${type}_ticket`)
            .setLabel(`${config.label} Ticket`)
            .setStyle(ButtonStyle.Primary)
    );

    return message.channel.send({
        embeds: [embed],
        components: [row]
    });
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

const matchedWord = blockedWords.find((word, index) =>
    blockedRegexes[index].test(content)
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
