f = open('index.js', 'r')
code = f.read()
f.close()

old = "                return message.reply('Mention a user.');\n            }\n            const lockKey"
new = "                return message.reply('Mention a user.');\n            }\n            if (!member.roles.cache.has(jailedRoleId)) return message.reply('That user is not jailed.');\n            const lockKey"

if old in code:
    code = code.replace(old, new)
    f = open('index.js', 'w')
    f.write(code)
    f.close()
    print('Done')
else:
    print('No match found')
