/**
 * Function Execution Modes
 */

const FunctionMode = {
    SYNC: 'sync',           // Wait for result, user needs response
    ASYNC: 'async',         // Fire and forget, no waiting
    BACKGROUND: 'background' // Execute but continue conversation
};

module.exports = FunctionMode;