const db = require('../database');
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('jail')
        .setDescription('Jail a member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to jail')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for jail')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const jailedRoleId = process.env.JAILED_ROLE_ID;
        const jailCategoryId = process.env.JAIL_CATEGORY_ID;

        const jailedRole = interaction.guild.roles.cache.get(jailedRoleId);

        console.log('Member:', member?.user?.tag);
        console.log('Role ID:', jailedRoleId);
        console.log('Role Found:', jailedRole);
        if (!member || !jailedRole) {
            return interaction.reply({ content: 'User or jailed role not found.', ephemeral: true });
        }

        const botMember = interaction.guild.members.me;

        const savedRoles = member.roles.cache
            .filter(role =>
                role.id !== interaction.guild.id &&
                !role.managed
            )
            .map(role => role.id);

        db.prepare(`
            INSERT OR REPLACE INTO jailed_users (user_id, roles)
            VALUES (?, ?)
        `).run(member.id, JSON.stringify(savedRoles));

        const rolesToRemove = member.roles.cache.filter(role =>
            role.id !== interaction.guild.id &&
            role.id !== jailedRoleId &&
            !role.managed &&
            role.position < botMember.roles.highest.position
        );

        await member.roles.remove(rolesToRemove);
        await member.roles.add(jailedRole);

        let jailChannel = interaction.guild.channels.cache.find(
            ch => ch.name === `jail-${member.user.username.toLowerCase()}`
        );

        if (!jailChannel) {
            jailChannel = await interaction.guild.channels.create({
                name: `jail-${member.user.username.toLowerCase()}`,
                type: ChannelType.GuildText,
                parent: jailCategoryId,
                permissionOverwrites: [
    {
        id: interaction.guild.id,
        deny: ['ViewChannel']
    },
    {
        id: member.id,
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
    },
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

await jailChannel.send({
    content: `${member} <@&1371005644638912542>`,
    embeds: [jailEmbed]
});

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: `${member} has been jailed for: ${reason}`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `${member} has been jailed for: ${reason}`,
                ephemeral: true
            });
        }
    }
};