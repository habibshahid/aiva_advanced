/**
 * Logger Utility - Simple wrapper around console
 */

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] || LOG_LEVELS.info;

function formatTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function formatArgs(args) {
    return args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return '[Object]';
            }
        }
        return arg;
    }).join(' ');
}

const logger = {
    debug: (...args) => {
        if (LOG_LEVELS.debug >= currentLevel) {
            console.log(`${formatTimestamp()} [DEBUG]:`, ...args);
        }
    },
    
    info: (...args) => {
        if (LOG_LEVELS.info >= currentLevel) {
            console.log(`${formatTimestamp()} [INFO]:`, ...args);
        }
    },
    
    warn: (...args) => {
        if (LOG_LEVELS.warn >= currentLevel) {
            console.warn(`${formatTimestamp()} [WARN]:`, ...args);
        }
    },
    
    error: (...args) => {
        if (LOG_LEVELS.error >= currentLevel) {
            console.error(`${formatTimestamp()} [ERROR]:`, ...args);
        }
    }
};

module.exports = logger;