/**
 * @fileoverview Tool Executor for Nova Sonic Tool Use
 * 
 * This module executes tool requests from Nova Sonic. When Nova Sonic decides
 * it needs information from a knowledge base, it sends a tool use request.
 * This executor handles that request by:
 * 1. Validating the request
 * 2. Querying the appropriate knowledge base
 * 3. Formatting results for Nova Sonic
 * 
 * The executor is designed to be fast and reliable - tool execution failures
 * gracefully degrade without breaking the conversation.
 * 
 * @author Twilio Bedrock Bridge Team
 * @version 1.0.0
 */

import { KnowledgeBaseClient } from '../knowledge/KnowledgeBaseClient';
import { getKnowledgeBaseIdFromToolName } from './KnowledgeBaseTools';
import { 
  ToolUseRequest, 
  ToolResult, 
  KnowledgeBaseSearchResult 
} from './types';
import { configManager } from '../config/ConfigurationManager';
import logger from '../observability/logger';
import { CorrelationIdManager } from '../utils/correlationId';

/**
 * Tool Executor Service
 * 
 * This class handles the actual execution of tools when Nova Sonic requests them.
 * It's the "kitchen" that fulfills the "orders" (tool use requests).
 */
export class ToolExecutor {
  private knowledgeBaseClient: KnowledgeBaseClient;
  
  /**
   * Create a new ToolExecutor
   * 
   * @param knowledgeBaseClient - Optional custom knowledge base client (useful for testing)
   */
  constructor(knowledgeBaseClient?: KnowledgeBaseClient) {
    this.knowledgeBaseClient = knowledgeBaseClient || new KnowledgeBaseClient();
  }
  
  /**
   * Execute a tool request from Nova Sonic
   * 
   * This is the main entry point. When Nova Sonic says "I need to use a tool",
   * this method figures out what to do and returns the results.
   * 
   * @param toolUse - The tool use request from Nova Sonic
   * @param sessionId - Session ID for logging and correlation
   * @returns Promise with the tool result to send back to Nova Sonic
   */
  async executeTool(
    toolUse: ToolUseRequest,
    sessionId: string
  ): Promise<ToolResult> {
    const correlationId = CorrelationIdManager.getCurrentCorrelationId();
    
    logger.info('Executing tool', {
      correlationId,
      sessionId,
      toolName: toolUse.name,
      toolUseId: toolUse.toolUseId,
      input: toolUse.input
    });
    
    try {
      // Execute the knowledge base search
      const searchResult = await this.executeKnowledgeBaseTool(toolUse, sessionId);
      
      // Convert to Nova Sonic's expected format
      return this.formatToolResult(toolUse.toolUseId, searchResult);
      
    } catch (error) {
      logger.error('Tool execution failed', {
        correlationId,
        sessionId,
        toolName: toolUse.name,
        toolUseId: toolUse.toolUseId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Return error result - Nova Sonic will handle gracefully
      return this.formatErrorResult(
        toolUse.toolUseId,
        'I was unable to retrieve that information at the moment.'
      );
    }
  }
  
  /**
   * Execute a knowledge base search tool
   * 
   * This method:
   * 1. Validates the tool request
   * 2. Finds the correct knowledge base
   * 3. Executes the search
   * 4. Formats results
   * 
   * @param toolUse - Tool use request
   * @param sessionId - Session ID
   * @returns Search results in internal format
   */
  private async executeKnowledgeBaseTool(
    toolUse: ToolUseRequest,
    sessionId: string
  ): Promise<KnowledgeBaseSearchResult> {
    const correlationId = CorrelationIdManager.getCurrentCorrelationId();
    
    // Extract and validate the query parameter
    const { query } = toolUse.input;
    
    if (!query || typeof query !== 'string') {
      logger.warn('Invalid tool input: missing or invalid query', {
        correlationId,
        sessionId,
        toolName: toolUse.name,
        input: toolUse.input
      });
      
      return {
        results: [],
        resultCount: 0,
        query: '',
        status: 'error',
        error: 'Invalid query parameter'
      };
    }
    
    // Find which knowledge base to query
    const knowledgeBaseId = getKnowledgeBaseIdFromToolName(toolUse.name);
    
    if (!knowledgeBaseId) {
      logger.error('Could not find knowledge base for tool', {
        correlationId,
        sessionId,
        toolName: toolUse.name
      });
      
      return {
        results: [],
        resultCount: 0,
        query,
        status: 'error',
        error: 'Knowledge base not found'
      };
    }
    
    // Get RAG configuration for filtering results
    const ragConfig = configManager.rag;
    const maxResults = ragConfig?.maxResults ?? 3;
    const minRelevanceScore = ragConfig?.minRelevanceScore ?? 0.5;
    
    logger.debug('Querying knowledge base', {
      correlationId,
      sessionId,
      knowledgeBaseId,
      query,
      maxResults,
      minRelevanceScore
    });
    
    try {
      // Execute the knowledge base query
      const rawResults = await this.knowledgeBaseClient.query(
        query,
        knowledgeBaseId,
        sessionId
      );
      
      // Filter and limit results based on relevance
      const filteredResults = rawResults
        .filter(result => result.confidence >= minRelevanceScore)
        .slice(0, maxResults)
        .map(result => ({
          content: result.content,
          source: result.source || 'knowledge_base',
          relevanceScore: result.confidence
        }));
      
      logger.info('Knowledge base query completed', {
        correlationId,
        sessionId,
        knowledgeBaseId,
        query,
        totalResults: rawResults.length,
        filteredResults: filteredResults.length
      });
      
      return {
        results: filteredResults,
        resultCount: filteredResults.length,
        query,
        status: 'success'
      };
      
    } catch (error) {
      logger.error('Knowledge base query failed', {
        correlationId,
        sessionId,
        knowledgeBaseId,
        query,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        results: [],
        resultCount: 0,
        query,
        status: 'error',
        error: 'Failed to query knowledge base'
      };
    }
  }
  
  /**
   * Format a successful tool result for Nova Sonic
   * 
   * Nova Sonic expects results in a specific format. This method converts
   * our internal search results to that format.
   * 
   * Important: We format the results as raw information without any
   * commentary like "Here's what I found" - Nova Sonic will naturally
   * incorporate this into its response.
   * 
   * @param toolUseId - Tool use ID from the request
   * @param searchResult - Internal search results
   * @returns Formatted tool result
   */
  private formatToolResult(
    toolUseId: string,
    searchResult: KnowledgeBaseSearchResult
  ): ToolResult {
    if (searchResult.status === 'error' || searchResult.resultCount === 0) {
      return this.formatErrorResult(
        toolUseId,
        searchResult.error || 'No information found'
      );
    }
    
    // Format results as a single text block for Nova Sonic
    // Nova Sonic will use this information to answer the user's question
    const formattedContent = searchResult.results
      .map((result, index) => {
        // For voice, we keep it concise - no need for source citations
        // Nova Sonic will naturally paraphrase this information
        return result.content;
      })
      .join('\n\n');
    
    return {
      toolUseId,
      content: [
        {
          text: formattedContent
        }
      ],
      status: 'success'
    };
  }
  
  /**
   * Format an error result for Nova Sonic
   * 
   * When tool execution fails, we return a result that allows Nova Sonic
   * to gracefully handle the error. Nova Sonic might say something like
   * "I don't have that information available right now" instead of exposing
   * technical errors.
   * 
   * @param toolUseId - Tool use ID from the request
   * @param errorMessage - User-friendly error message
   * @returns Formatted error result
   */
  private formatErrorResult(toolUseId: string, errorMessage: string): ToolResult {
    return {
      toolUseId,
      content: [
        {
          text: errorMessage
        }
      ],
      status: 'error'
    };
  }
  
  /**
   * Validate that the executor is properly configured
   * 
   * @returns Object with validation result
   */
  validateConfiguration(): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    try {
      // Check knowledge base client is available
      if (!this.knowledgeBaseClient) {
        issues.push('Knowledge base client not initialized');
      }
      
      // Check RAG configuration
      const ragConfig = configManager.rag;
      if (!ragConfig) {
        issues.push('RAG configuration not found');
      } else {
        if (ragConfig.maxResults < 1) {
          issues.push('maxResults must be at least 1');
        }
        if (ragConfig.minRelevanceScore < 0 || ragConfig.minRelevanceScore > 1) {
          issues.push('minRelevanceScore must be between 0 and 1');
        }
      }
      
      return {
        isValid: issues.length === 0,
        issues
      };
      
    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        isValid: false,
        issues
      };
    }
  }
}
