/**
 * Conversation Manager
 * Handles turn-taking, interruption handling, and conversation flow
 * 
 * Features:
 * - Turn state management (user speaking, agent speaking, idle)
 * - Interruption handling (user speaks while agent is talking)
 * - Barge-in support (stop agent immediately on interruption)
 * - Silence detection and timeout
 * - Greeting management
 */

const EventEmitter = require('events');

// Turn states
const TurnState = {
    IDLE: 'idle',
    USER_SPEAKING: 'user_speaking',
    PROCESSING: 'processing',
    AGENT_SPEAKING: 'agent_speaking'
};

class ConversationManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Timing settings
            silenceTimeoutMs: config.silenceTimeoutMs || 30000,     // End conversation after 30s silence
            interruptionThresholdMs: config.interruptionThresholdMs || 200,  // Min speech to count as interruption
            minSpeechLengthMs: config.minSpeechLengthMs || 500,     // Min speech to process
            
            // Behavior
            allowBargeIn: config.allowBargeIn !== false,           // Allow interrupting agent
            playGreeting: config.playGreeting !== false,           // Play greeting on start
            
            ...config
        };
        
        // State
        this.turnState = TurnState.IDLE;
        this.conversationStarted = false;
        this.greetingPlayed = false;
        
        // Timing
        this.lastActivityTime = Date.now();
        this.userSpeechStartTime = null;
        this.agentSpeechStartTime = null;
        
        // Buffers
        this.pendingUserTranscript = '';
        this.currentAgentResponse = '';
        
        // Interruption tracking
        this.wasInterrupted = false;
        this.interruptedAt = null;
        
        // Silence timer
        this.silenceTimer = null;
        
        // Metrics
        this.metrics = {
            turns: 0,
            interruptions: 0,
            userSpeechSeconds: 0,
            agentSpeechSeconds: 0
        };
    }
    
    /**
     * Start the conversation
     */
    start(greeting = null) {
        this.conversationStarted = true;
        this.lastActivityTime = Date.now();
        this.turnState = TurnState.IDLE;
        
        console.log('[CONV-MGR] Conversation started');
        
        this.startSilenceTimer();
        
        // Handle greeting
        if (this.config.playGreeting && greeting && !this.greetingPlayed) {
            this.greetingPlayed = true;
            
            // Small delay before greeting
            setTimeout(() => {
                this.emit('greeting.requested', { text: greeting });
            }, 500);
        }
        
        this.emit('conversation.started');
    }
    
    /**
     * Handle user started speaking
     */
    onUserSpeechStarted() {
        // Prevent duplicate calls when already in user speaking state
        if (this.turnState === TurnState.USER_SPEAKING) {
            return;  // Already detected speech start
        }
        
        this.lastActivityTime = Date.now();
        this.userSpeechStartTime = Date.now();
        this.resetSilenceTimer();
        
        const previousState = this.turnState;
        
        // Check if this is an interruption
        if (this.turnState === TurnState.AGENT_SPEAKING) {
            this.handleInterruption();
        }
        
        this.turnState = TurnState.USER_SPEAKING;
        
        console.log(`[CONV-MGR] User started speaking (was: ${previousState})`);
        
        this.emit('turn.user_started', {
            wasInterruption: previousState === TurnState.AGENT_SPEAKING
        });
    }
    
    /**
     * Handle user stopped speaking (endpoint detected)
     */
    onUserSpeechEnded(transcript) {
        this.lastActivityTime = Date.now();
        this.resetSilenceTimer();
        
        const speechDuration = this.userSpeechStartTime 
            ? Date.now() - this.userSpeechStartTime 
            : 0;
        
        this.metrics.userSpeechSeconds += speechDuration / 1000;
        
        // Check minimum speech length
        if (speechDuration < this.config.minSpeechLengthMs) {
            console.log(`[CONV-MGR] Speech too short (${speechDuration}ms), ignoring`);
            this.turnState = TurnState.IDLE;
            return;
        }
        
        console.log(`[CONV-MGR] User speech ended: "${transcript}" (${speechDuration}ms)`);
        
        this.pendingUserTranscript = transcript;
        this.turnState = TurnState.PROCESSING;
        this.metrics.turns++;
        
        this.emit('turn.user_ended', {
            transcript: transcript,
            durationMs: speechDuration
        });
        
        // Request LLM response
        this.emit('response.requested', {
            transcript: transcript,
            wasInterruption: this.wasInterrupted
        });
        
        this.wasInterrupted = false;
    }
    
    /**
     * Handle interruption (user speaks while agent is talking)
     */
    handleInterruption() {
        if (!this.config.allowBargeIn) {
            console.log('[CONV-MGR] Barge-in disabled, ignoring interruption');
            return;
        }
        
        console.log('[CONV-MGR] Interruption detected!');
        
        this.wasInterrupted = true;
        this.interruptedAt = Date.now();
        this.metrics.interruptions++;
        
        // Emit event to stop TTS playback
        this.emit('agent.interrupted', {
            partialResponse: this.currentAgentResponse,
            interruptedAt: this.interruptedAt
        });
        
        // Clear agent state
        this.currentAgentResponse = '';
        this.agentSpeechStartTime = null;
    }
    
    /**
     * Handle agent started speaking
     */
    onAgentSpeechStarted(response = '') {
        this.lastActivityTime = Date.now();
        this.agentSpeechStartTime = Date.now();
        this.currentAgentResponse = response;
        this.turnState = TurnState.AGENT_SPEAKING;
        
        this.resetSilenceTimer();
        
        console.log('[CONV-MGR] Agent started speaking');
        
        this.emit('turn.agent_started', {
            response: response
        });
    }
    
    /**
     * Handle agent finished speaking
     */
    onAgentSpeechEnded() {
        const speechDuration = this.agentSpeechStartTime 
            ? Date.now() - this.agentSpeechStartTime 
            : 0;
        
        this.metrics.agentSpeechSeconds += speechDuration / 1000;
        
        console.log(`[CONV-MGR] Agent speech ended (${speechDuration}ms)`);
        
        this.turnState = TurnState.IDLE;
        this.currentAgentResponse = '';
        this.agentSpeechStartTime = null;
        
        this.emit('turn.agent_ended', {
            durationMs: speechDuration
        });
        
        this.startSilenceTimer();
    }
    
    /**
     * Handle interim transcript (real-time feedback)
     */
    onInterimTranscript(text) {
        this.lastActivityTime = Date.now();
        this.resetSilenceTimer();
        
        // Store for reference
        this.pendingUserTranscript = text;
        
        this.emit('transcript.interim', { text: text });
    }
    
    /**
     * Start silence timer
     */
    startSilenceTimer() {
        this.resetSilenceTimer();
        
        this.silenceTimer = setTimeout(() => {
            if (this.turnState === TurnState.IDLE) {
                console.log('[CONV-MGR] Silence timeout reached');
                this.emit('silence.timeout');
            }
        }, this.config.silenceTimeoutMs);
    }
    
    /**
     * Reset silence timer
     */
    resetSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }
    
    /**
     * Add function call result to context
     */
    onFunctionResult(functionName, result, shouldSpeak = true) {
        console.log(`[CONV-MGR] Function result: ${functionName}`);
        
        this.emit('function.result', {
            name: functionName,
            result: result,
            shouldSpeak: shouldSpeak
        });
    }
    
    /**
     * End the conversation
     */
    end(reason = 'normal') {
        console.log(`[CONV-MGR] Conversation ended: ${reason}`);
        
        this.resetSilenceTimer();
        this.turnState = TurnState.IDLE;
        this.conversationStarted = false;
        
        this.emit('conversation.ended', {
            reason: reason,
            metrics: this.getMetrics()
        });
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            turnState: this.turnState,
            conversationStarted: this.conversationStarted,
            greetingPlayed: this.greetingPlayed,
            lastActivityTime: this.lastActivityTime,
            wasInterrupted: this.wasInterrupted
        };
    }
    
    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            totalDurationSeconds: this.conversationStarted 
                ? (Date.now() - this.lastActivityTime) / 1000 
                : 0
        };
    }
    
    /**
     * Check if agent is currently speaking
     */
    isAgentSpeaking() {
        return this.turnState === TurnState.AGENT_SPEAKING;
    }
    
    /**
     * Check if user is currently speaking
     */
    isUserSpeaking() {
        return this.turnState === TurnState.USER_SPEAKING;
    }
    
    /**
     * Check if system is processing
     */
    isProcessing() {
        return this.turnState === TurnState.PROCESSING;
    }
    
    /**
     * Check if conversation is idle
     */
    isIdle() {
        return this.turnState === TurnState.IDLE;
    }
}

// Export both class and states
module.exports = ConversationManager;
module.exports.TurnState = TurnState;
