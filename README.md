# Private Discord Server-Management Bot

This is a beginner-friendly private bot for one Discord server.

Built with:

- Node.js
- discord.js v14
- SQLite
- dotenv

Current core modules included:

- Moderation
- Jail system
- Automod
- Logging

Not built yet:

- Economy
- Tickets
- Reaction/button role menus
- Shop, games, XP, levels

Those should be added after the core safety systems are tested.

## File Structure

Put all files in one project folder:

```text
private-server-management-bot/
  package.json
  .env.example
  .gitignore
  config.json
  README.md
  src/
    commands.js
    config.js
    database.js
    deploy-commands.js
    index.js
    services/
      automod.js
      jail.js
      logger.js
      moderation.js
    utils/
      embeds.js
      format.js
      permissions.js
```

The SQLite database is created automatically at:

```text
data/serverbot.sqlite
```

## Commands Included

Moderation:

- `/ban`
- `/kick`
- `/warn`
- `/timeout`
- `/purge`

Jail:

- `/jail`
- `/unjail`
- `/jailinfo`

Each moderation and jail action creates a case number and sends an embed log.

## Step 1: Install Node.js

Install the LTS version of Node.js:

https://nodejs.org/

Then check that it works:

```bash
node -v
npm -v
```

## Step 2: Install Packages

In the project folder, run:

```bash
npm install
```

## Step 3: Create `.env`

Copy `.env.example` and rename the copy to `.env`.

Fill in:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here
```

### `DISCORD_TOKEN`

This is your bot token.

Find it here:

1. Go to https://discord.com/developers/applications
2. Open your application.
3. Go to **Bot**.
4. Click **Reset Token** or **View Token**.
5. Put it after `DISCORD_TOKEN=`.

Never share this token.

### `CLIENT_ID`

This is your bot application's ID.

Find it here:

1. Go to https://discord.com/developers/applications
2. Open your application.
3. Go to **General Information**.
4. Copy **Application ID**.
5. Put it after `CLIENT_ID=`.

### `GUILD_ID`

This is your server ID.

Find it in Discord:

1. Open **User Settings**.
2. Go to **Advanced**.
3. Turn on **Developer Mode**.
4. Right-click your server icon.
5. Click **Copy Server ID**.
6. Put it after `GUILD_ID=`.

## Step 4: Edit `config.json`

All server IDs go in `config.json`.

Open `config.json` and fill in the IDs you want to use.

### Staff Role IDs

Put staff role IDs here:

```json
"staffRoleIds": ["111111111111111111"]
```

Members with these roles can use staff commands.

### Protected Role IDs

Put protected role IDs here:

```json
"protectedRoleIds": ["222222222222222222"]
```

The bot will not jail or moderate members with protected roles.

The bot will also avoid removing protected roles from anyone.

### Jailed Role ID

Put your jailed role ID here:

```json
"roles": {
  "jailed": "333333333333333333"
}
```

The bot adds this role when someone is jailed.

### Log Channel IDs

Put log channel IDs here:

```json
"channels": {
  "modLogs": "444444444444444444",
  "messageLogs": "555555555555555555",
  "memberLogs": "666666666666666666",
  "jailLogs": "777777777777777777"
}
```

If `messageLogs`, `memberLogs`, or `jailLogs` are blank, the bot falls back to `modLogs`.

### Jail Category ID

Put your jail category ID here:

```json
"categories": {
  "jail": "888888888888888888"
}
```

The bot creates private jail channels inside this category.

### Blocked Words and Slurs

Put blocked words or phrases here:

```json
"blockedWords": [
  "blocked word here",
  "blocked phrase here"
]
```

The included examples are placeholders. Replace or remove them before going live.

By default, blocked words:

- delete the triggering message
- auto-jail the user
- create a jail case
- create/open a private jail channel
- log the action

## Step 5: Bot Permissions

The bot needs these permissions:

- View Channels
- Send Messages
- Read Message History
- Manage Messages
- Manage Roles
- Manage Channels
- Kick Members
- Ban Members
- Moderate Members
- Use Slash Commands

Important role rule:

The bot's highest role must be above the jailed role and above any normal roles it needs to remove or restore.

The bot will never remove:

- managed roles
- bot-managed roles
- administrator roles
- protected roles
- roles higher than the bot's highest role

## Step 6: Enable Bot Intents

In the Discord Developer Portal, open your bot and go to **Bot**.

Enable:

- Server Members Intent
- Message Content Intent

Automod and logging need these.

## Step 7: Register Slash Commands

Run:

```bash
npm run deploy
```

You should see something like:

```text
Registered 8 slash commands.
```

## Step 8: Start the Bot

Run:

```bash
npm start
```

You should see:

```text
Logged in as YourBotName#0000
```

## Automod Settings

Automod lives in `config.json`.

It currently checks:

- blocked words/slurs
- Discord invite links
- spam
- caps
- mass mentions
- repeated messages

Escalating punishments are configured here:

```json
"punishments": [
  {
    "offenses": 1,
    "action": "warn"
  },
  {
    "offenses": 2,
    "action": "timeout",
    "durationSeconds": 300
  },
  {
    "offenses": 3,
    "action": "jail"
  },
  {
    "offenses": 5,
    "action": "ban"
  }
]
```

Allowed actions:

- `none`
- `warn`
- `timeout`
- `jail`
- `ban`

Restart the bot after editing `config.json`.

## Jail Behavior

When a member is jailed, the bot:

1. Checks protected roles and role hierarchy.
2. Creates a private jail channel.
3. Adds the jailed role.
4. Removes only safe removable roles.
5. Stores removed roles in SQLite.
6. Logs the jail action with a case number.

When a member is unjailed, the bot:

1. Removes the jailed role.
2. Restores the stored safe roles.
3. Deletes the jail channel if `deleteChannelOnUnjail` is `true`.
4. Logs the unjail action with a case number.

While someone is jailed, the bot also watches role changes. If someone tries to add normal roles back to the jailed member, the bot removes those roles again.

## Beginner Troubleshooting

If slash commands do not appear:

```bash
npm run deploy
```

If the bot cannot remove roles:

- move the bot's role higher
- make sure it has **Manage Roles**
- make sure the role is not managed, admin, protected, or above the bot

If automod does nothing:

- enable **Message Content Intent**
- check `automod.enabled` in `config.json`
- make sure the user is not staff, protected, or admin

If logs do not appear:

- check the channel IDs in `config.json`
- make sure the bot can view and send messages in those channels
