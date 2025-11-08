/**
 * @fileoverview Type definitions for Nova Sonic Tool Use
 * 
 * This module defines TypeScript interfaces for tools that Nova Sonic can use
 * to retrieve information from knowledge bases. These types follow the AWS Bedrock
 * Nova Sonic tool specification format.
 * 
 * Key Concepts:
 * - ToolDefinition: Describes what a tool does and what inputs it needs
 * - ToolUseRequest: When Nova Sonic decides to use a tool, it sends this
 * - ToolResult: The response we send back after executing the tool
 * 
 * @author Twilio Bedrock Bridge Team
 * @version 1.0.0
 */

/**
 * JSON Schema definition for tool input parameters
 * This describes what inputs the tool accepts
 */
export interface ToolInputSchema {
  /** Schema type - always 'object' for tool inputs */
  type: 'object';
  /** Properties the tool accepts (e.g., 'query', 'maxResults') */
  properties: Record<string, {
    type: string;
    description: string;
    default?: any;
  }>;
  /** Which properties are required */
  required: string[];
}

/**
 * Tool Definition
 * This describes a single tool that Nova Sonic can use
 * 
 * Example: A tool to search a knowledge base would have:
 * - name: "search_company_policies"
 * - description: "Search company policy documents"
 * - inputSchema: Defines that it needs a 'query' parameter
 */
export interface ToolDefinition {
  /** Unique name for this tool (e.g., 'search_company_policies') */
  name: string;
  
  /** Human-readable description of what this tool does */
  description: string;
  
  /** Schema defining what inputs this tool accepts */
  inputSchema: ToolInputSchema;
}

/**
 * Tool Use Request from Nova Sonic
 * When Nova Sonic decides to use a tool during conversation,
 * it sends a request in this format
 * 
 * Example: User asks "What's our vacation policy?"
 * Nova Sonic sends:
 * {
 *   name: "search_company_policies",
 *   toolUseId: "abc123",
 *   input: { query: "vacation policy" }
 * }
 */
export interface ToolUseRequest {
  /** Which tool Nova Sonic wants to use */
  name: string;
  
  /** Unique ID for this tool use (we need to include this in the response) */
  toolUseId: string;
  
  /** The actual parameters Nova Sonic is passing to the tool */
  input: Record<string, any>;
}

/**
 * Tool Result
 * The response we send back to Nova Sonic after executing a tool
 * 
 * This can contain either successful results or an error message
 */
export interface ToolResult {
  /** Must match the toolUseId from the request */
  toolUseId: string;
  
  /** The content we're sending back - can be JSON data or error info */
  content: Array<{
    json?: any;
    text?: string;
  }>;
  
  /** Optional status indicator */
  status?: 'success' | 'error';
}

/**
 * Tool Configuration for a Session
 * This is what we send to Nova Sonic when starting a conversation
 * to tell it which tools are available
 */
export interface ToolConfiguration {
  /** List of tools Nova Sonic can use in this session */
  tools: Array<{
    toolSpec: {
      name: string;
      description: string;
      inputSchema: {
        json: ToolInputSchema;
      };
    };
  }>;
}

/**
 * Knowledge Base Search Result
 * Internal format for knowledge base query results
 * (This gets formatted into a ToolResult before sending to Nova Sonic)
 */
export interface KnowledgeBaseSearchResult {
  /** Array of results from the knowledge base */
  results: Array<{
    /** The actual content/text from the knowledge base */
    content: string;
    /** Where this information came from (e.g., document name) */
    source: string;
    /** How relevant this result is (0.0 to 1.0) */
    relevanceScore: number;
  }>;
  
  /** Total number of results found */
  resultCount: number;
  
  /** The original query that was searched */
  query: string;
  
  /** Execution status */
  status: 'success' | 'error';
  
  /** Error message if status is 'error' */
  error?: string;
}
