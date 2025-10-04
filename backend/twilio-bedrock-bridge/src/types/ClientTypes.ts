/**
 * @fileoverview Type Definitions for Bedrock Client
 * 
 * Comprehensive type definitions for better type safety and IDE support
 */

import { BedrockRuntimeClientConfig } from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2HandlerOptions } from "@smithy/node-http-handler";
import { Provider } from "@smithy/types";
import { Subject } from 'rxjs';

/**
 * Configuration for the Nova Sonic bidirectional stream client
 */
export interface NovaSonicClientConfig {
  /** HTTP/2 request handler configuration */
  requestHandlerConfig?: NodeHttp2HandlerOptions | Provider<NodeHttp2HandlerOptions | void>;
  
  /** AWS Bedrock Runtime client configuration */
  clientConfig: Partial<BedrockRuntimeClientConfig>;
  
  /** Model inference configuration */
  inferenceConfig?: InferenceConfig;
}

/**
 * Model inference configuration parameters
 */
export interface InferenceConfig {
  /** Maximum number of tokens to generate */
  maxTokens: number;
  
  /** Top-p sampling parameter (0.0 to 1.0) */
  topP: number;
  
  /** Temperature for randomness (0.0 to 2.0) */
  temperature: number;
  
  /** Optional stop sequences */
  stopSequences?: string[];
}

/**
 * Audio configuration for input streams
 */
export interface AudioInputConfig {
  /** Audio format (e.g., 'pcm') */
  format: string;
  
  /** Sample rate in Hz */
  sampleRate: number;
  
  /** Number of audio channels */
  channels: number;
  
  /** Bits per sample */
  bitsPerSample: number;
}

/**
 * Audio configuration for output streams
 */
export interface AudioOutputConfig {
  /** Audio format for output */
  format: string;
  
  /** Sample rate for output */
  sampleRate: number;
}

/**
 * Text configuration for content
 */
export interface TextConfig {
  /** Media type for text content */
  mediaType: string;
}

/**
 * Session state information
 */
export interface SessionState {
  /** Unique session identifier */
  sessionId: string;
  
  /** Whether the session is currently active */
  isActive: boolean;
  
  /** Whether prompt start has been sent */
  isPromptStartSent: boolean;
  
  /** Whether audio content start has been sent */
  isAudioContentStartSent: boolean;
  
  /** Whether waiting for model response */
  isWaitingForResponse: boolean;
  
  /** Timestamp of last activity */
  lastActivity: number;
  
  /** Current prompt name */
  promptName: string;
  
  /** Audio content identifier */
  audioContentId: string;
}

/**
 * Event handler function type
 */
export type EventHandler<T = any> = (data: T) => void;

/**
 * Event data structure
 */
export interface EventData {
  /** Event type identifier */
  type: string;
  
  /** Event payload data */
  data: any;
  
  /** Timestamp when event occurred */
  timestamp?: string;
  
  /** Session ID associated with event */
  sessionId?: string;
}

/**
 * Audio streaming options
 */
export interface AudioStreamOptions {
  /** Maximum queue size for audio chunks */
  maxQueueSize?: number;
  
  /** Maximum chunks to process per batch */
  maxChunksPerBatch?: number;
  
  /** Whether to drop oldest chunks when queue is full */
  dropOldestOnFull?: boolean;
}

/**
 * Session creation options
 */
export interface SessionOptions {
  /** Custom session ID (auto-generated if not provided) */
  sessionId?: string;
  
  /** Custom inference configuration */
  inferenceConfig?: InferenceConfig;
  
  /** Audio streaming options */
  audioOptions?: AudioStreamOptions;
}

/**
 * Stream event types
 */
export type StreamEventType = 
  | 'sessionStart'
  | 'sessionEnd'
  | 'promptStart'
  | 'promptEnd'
  | 'contentStart'
  | 'contentEnd'
  | 'textOutput'
  | 'audioOutput'
  | 'completionStart'
  | 'completionEnd'
  | 'usageEvent'
  | 'error'
  | 'streamComplete'
  | 'any';

/**
 * Content types for streaming
 */
export type ContentType = 'AUDIO' | 'TEXT' | 'TOOL';

/**
 * Error event data structure
 */
export interface ErrorEventData {
  /** Error source/type */
  source: string;
  
  /** Error message */
  message: string;
  
  /** Detailed error information */
  details?: any;
  
  /** Raw error object */
  rawError?: any;
  
  /** Error type classification */
  type?: 'modelStreamErrorException' | 'internalServerException' | 'validationException';
}

/**
 * Usage event data structure
 */
export interface UsageEventData {
  /** Input tokens consumed */
  inputTokens?: number;
  
  /** Output tokens generated */
  outputTokens?: number;
  
  /** Total tokens used */
  totalTokens?: number;
}

/**
 * Text output event data
 */
export interface TextOutputEventData {
  /** Generated text content */
  text: string;
  
  /** Content identifier */
  contentId?: string;
  
  /** Content name */
  contentName?: string;
}

/**
 * Audio output event data
 */
export interface AudioOutputEventData {
  /** Base64 encoded audio data */
  audio: string;
  
  /** Content identifier */
  contentId?: string;
  
  /** Content name */
  contentName?: string;
  
  /** Audio format information */
  format?: string;
}

/**
 * Session cleanup callback type
 */
export type SessionCleanupCallback = (sessionId: string) => void | Promise<void>;

/**
 * Client lifecycle hooks
 */
export interface ClientHooks {
  /** Called before session creation */
  beforeSessionCreate?: (sessionId: string) => void | Promise<void>;
  
  /** Called after session creation */
  afterSessionCreate?: (sessionId: string) => void | Promise<void>;
  
  /** Called before session cleanup */
  beforeSessionCleanup?: SessionCleanupCallback;
  
  /** Called after session cleanup */
  afterSessionCleanup?: SessionCleanupCallback;
}