const fs = require('node:fs')
const path = require('node:path')

const logsDirectory = path.join(__dirname, 'logs')
const logFilePath =
    process.env.STOCKMATE_LOG_PATH ||
    path.join(logsDirectory, 'app.log')

fs.mkdirSync(path.dirname(logFilePath), { recursive: true })

function logEvent(level, event, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...details,
    }

    const line = `${JSON.stringify(entry)}\n`

    try {
        fs.appendFileSync(logFilePath, line, 'utf8')
    } catch {
        console.error('Failed to write application log')
    }

    if (level === 'error') {
        console.error(line.trim())
    } else {
        console.log(line.trim())
    }
}

module.exports = { logEvent }