/**
 * @fileoverview Stream Session Management
 * 
 * Provides a high-level interface for managing individual streaming sessions
 */

import { Buffer } from "node:buffer";
import logger from '../utils/logger';
import { CLIENT_DEFAULTS } from '../config/ClientConfig';
import { AudioProcessingError, SessionInactiveError } from '../errors/ClientErrors';
import { EventHandler, AudioStreamOptions, StreamEventType } from '../types/ClientTypes';
import {
  DefaultAudioInputConfiguration,
  DefaultTextConfiguration,
  DefaultSystemPrompt
} from "../utils/constants";

/**
 * Interface for the underlying client that manages sessions
 */
export interface StreamClientInterface {
  isSessionActive(sessionId: string): boolean;
  registerEventHandler(sessionId: string, eventType: string, handler: EventHandler): void;
  setupPromptStartEvent(sessionId: string): void;
  setupSystemPromptEvent(sessionId: string, textConfig: any, systemPromptContent: string): void;
  setupStartAudioEvent(sessionId: string, audioConfig: any): void;
  streamAudioChunk(sessionId: string, audioData: Buffer): Promise<void>;
  sendContentEnd(sessionId: string): void;
  sendPromptEnd(sessionId: string): void;
  sendSessionEnd(sessionId: string): void;

  /**
   * Optional real-time / VAD / interruption controls exposed by the underlying client.
   * These are used by StreamSession for higher-level conversation control.
   */
  enableRealtimeInterruption?(sessionId: string): void;
  handleUserInterruption?(sessionId: string): void;
  setUserSpeakingState?(sessionId: string, speaking: boolean): void;
}

/**
 * Represents a single streaming session with audio processing capabilities
 */
export class StreamSession {
  private audioBufferQueue: Buffer[] = [];
  private isProcessingAudio = false;
  private isActive = true;
  private readonly maxQueueSize: number;
  private readonly maxChunksPerBatch: number;

  constructor(
    private readonly sessionId: string,
    private readonly client: StreamClientInterface,
    audioOptions: AudioStreamOptions = {}
  ) {
    this.maxQueueSize = audioOptions.maxQueueSize ?? CLIENT_DEFAULTS.MAX_AUDIO_QUEUE_SIZE;
    this.maxChunksPerBatch = audioOptions.maxChunksPerBatch ?? CLIENT_DEFAULTS.MAX_CHUNKS_PER_BATCH;
  }

  /**
   * Gets the session ID
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Checks if the session is currently active
   */
  public isSessionActive(): boolean {
    return this.isActive && this.client.isSessionActive(this.sessionId);
  }

  /**
   * Registers an event handler for this session
   * @param eventType - Type of event to listen for
   * @param handler - Function to handle the event
   * @returns This session instance for method chaining
   */
  public onEvent(eventType: StreamEventType, handler: EventHandler): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  /**
   * Sets up the prompt start event for this session
   */
  public setupPromptStart(): void {
    this.ensureSessionActive();
    this.client.setupPromptStartEvent(this.sessionId);
  }

  /**
   * Sets up the system prompt for this session
   * @param textConfig - Text configuration (optional)
   * @param systemPromptContent - System prompt content (optional)
   */
  public setupSystemPrompt(
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent: string = DefaultSystemPrompt
  ): void {
    this.ensureSessionActive();
    this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
  }

  /**
   * Sets up audio streaming for this session
   * @param audioConfig - Audio configuration (optional)
   */
  public setupStartAudio(
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration
  ): void {
    this.ensureSessionActive();
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  /**
   * Streams audio data to the session
   * @param audioData - Audio data buffer to stream
   */
  public async streamAudio(audioData: Buffer): Promise<void> {
    this.ensureSessionActive();

    if (!Buffer.isBuffer(audioData)) {
      throw new AudioProcessingError('Audio data must be a Buffer', this.sessionId);
    }

    // Manage queue size to prevent memory issues
    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      this.audioBufferQueue.shift(); // Remove oldest chunk
      logger.warn(`Audio queue capacity exceeded for session ${this.sessionId}, dropping oldest chunk`);
    }

    // Add to queue and trigger processing
    this.audioBufferQueue.push(audioData);
    await this.processAudioQueue();
  }

  /**
   * Ends the current user turn by closing audio content and signaling prompt end
   */
  public endUserTurn(): void {
    if (!this.isActive) return;

    try {
      if (this.client.isSessionActive(this.sessionId)) {
        this.endAudioContent();
        this.endPrompt();
        logger.debug(`User turn ended for session ${this.sessionId}`);
      }
    } catch (error) {
      logger.error(`Failed to end user turn for session ${this.sessionId}:`, error);
      throw new AudioProcessingError('Failed to end user turn', this.sessionId, error as Error);
    }
  }

  /**
   * Ends the audio content stream
   */
  public endAudioContent(): void {
    this.ensureSessionActive();
    this.client.sendContentEnd(this.sessionId);
  }

  /**
   * Signals the end of the prompt
   */
  public endPrompt(): void {
    this.ensureSessionActive();
    this.client.sendPromptEnd(this.sessionId);
  }

  /**
   * Closes the session and cleans up resources
   */
  public async close(): Promise<void> {
    if (!this.isActive) return;

    try {
      this.isActive = false;
      this.clearAudioQueue();
      this.client.sendSessionEnd(this.sessionId);
      logger.info(`Session ${this.sessionId} closed successfully`);
    } catch (error) {
      logger.error(`Error closing session ${this.sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Gets current audio queue statistics
   */
  public getAudioQueueStats(): {
    queueLength: number;
    isProcessing: boolean;
    maxQueueSize: number;
  } {
    return {
      queueLength: this.audioBufferQueue.length,
      isProcessing: this.isProcessingAudio,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Processes the audio queue in batches
   */
  private async processAudioQueue(): Promise<void> {
    if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive) {
      return;
    }

    this.isProcessingAudio = true;

    try {
      let processedChunks = 0;

      while (
        this.audioBufferQueue.length > 0 && 
        processedChunks < this.maxChunksPerBatch && 
        this.isActive
      ) {
        const audioChunk = this.audioBufferQueue.shift();
        if (audioChunk) {
          await this.client.streamAudioChunk(this.sessionId, audioChunk);
          processedChunks++;
        }
      }

      logger.trace(`Processed ${processedChunks} audio chunks for session ${this.sessionId}`);

    } catch (error) {
      logger.error(`Error processing audio queue for session ${this.sessionId}:`, error);
      throw new AudioProcessingError('Failed to process audio queue', this.sessionId, error as Error);
    } finally {
      this.isProcessingAudio = false;

      // Schedule next processing if queue has items
      if (this.audioBufferQueue.length > 0 && this.isActive) {
        // Use setTimeout to avoid blocking the event loop
        setTimeout(() => this.processAudioQueue().catch(error => {
          logger.error(`Error in scheduled audio processing for session ${this.sessionId}:`, error);
        }), 0);
      }
    }
  }

  /**
   * Buffer audio output (model -> client) and related helpers
   */
  private audioOutputBuffer: Buffer[] = [];
  private readonly maxOutputBufferSize: number = CLIENT_DEFAULTS.MAX_AUDIO_QUEUE_SIZE;

  /**
   * Buffer model audio output (Nova Sonic can generate faster than real-time)
   */
  public bufferAudioOutput(audioData: Buffer): void {
    if (!this.isActive) return;
    if (!Buffer.isBuffer(audioData)) return;

    // Trim if necessary
    if (this.audioOutputBuffer.length >= this.maxOutputBufferSize) {
      this.audioOutputBuffer.shift();
      logger.warn(`Audio output buffer capacity exceeded for session ${this.sessionId}, dropping oldest chunk`);
    }

    this.audioOutputBuffer.push(audioData);
  }

  /**
   * Get next audio output chunk for playback
   */
  public getNextAudioOutput(): Buffer | null {
    return this.audioOutputBuffer.shift() || null;
  }

  /**
   * Get current output buffer size for monitoring
   */
  public getOutputBufferSize(): number {
    return this.audioOutputBuffer.length;
  }

  /**
   * Clear output buffer (useful for interruptions)
   */
  public clearOutputBuffer(): void {
    this.audioOutputBuffer.length = 0;
    logger.debug(`Cleared audio output buffer for session ${this.sessionId}`);
  }

  /**
   * Stream audio in real-time mode with low latency
   */
  public async streamAudioRealtime(audioData: Buffer): Promise<void> {
    this.ensureSessionActive();
    if (!Buffer.isBuffer(audioData)) {
      throw new AudioProcessingError('Audio data must be a Buffer', this.sessionId);
    }

    // Reuse existing processing/backpressure, but prefer immediate send
    // Attempt to send directly to the client implementation
    if (typeof this.client.streamAudioChunk === 'function') {
      await this.client.streamAudioChunk(this.sessionId, audioData);
      return;
    }

    // Fallback to queued processing
    this.audioBufferQueue.push(audioData);
    await this.processAudioQueue();
  }

  /**
   * Enable real-time interruption mode - allows model to respond while user is speaking
   */
  public enableRealtimeMode(): void {
    if (!this.isActive) return;
    if (typeof this.client.enableRealtimeInterruption === 'function') {
      this.client.enableRealtimeInterruption(this.sessionId);
    }
  }

  /**
   * Interrupt the model if it's currently speaking
   */
  public interruptModel(): void {
    if (!this.isActive) return;
    if (typeof this.client.handleUserInterruption === 'function') {
      this.client.handleUserInterruption(this.sessionId);
    }
  }

  /**
   * Set user speaking state for voice activity detection
   */
  public setUserSpeaking(speaking: boolean): void {
    if (!this.isActive) return;
    if (typeof this.client.setUserSpeakingState === 'function') {
      this.client.setUserSpeakingState(this.sessionId, speaking);
    }
  }

  /**
   * Clears the audio buffer queue
   */
  private clearAudioQueue(): void {
    this.audioBufferQueue.length = 0;
  }

  /**
   * Ensures the session is active, throws error if not
   */
  private ensureSessionActive(): void {
    if (!this.isActive) {
      throw new SessionInactiveError(this.sessionId);
    }
  }
}