/**
 * @fileoverview Knowledge Base Tool Definitions Generator
 * 
 * This module generates tool definitions for each configured knowledge base.
 * These tool definitions tell Nova Sonic what it CAN do - like giving it a menu
 * of available actions.
 * 
 * Key Function:
 * - getEnabledKnowledgeBaseTools(): Reads your configuration and creates a tool
 *   for each enabled knowledge base
 * 
 * Important: Nova Sonic won't announce it's using these tools. It will just
 * seamlessly search the knowledge base and incorporate the results into its response.
 * 
 * @author Twilio Bedrock Bridge Team
 * @version 1.0.0
 */

import { ToolDefinition } from './types';
import { configManager } from '../config/ConfigurationManager';
import logger from '../observability/logger';
import { CorrelationIdManager } from '../utils/correlationId';

/**
 * Create a tool definition for a single knowledge base
 * 
 * @param knowledgeBaseId - AWS Bedrock Knowledge Base ID
 * @param toolName - Unique name for this tool (e.g., 'search_company_policies')
 * @param description - What this knowledge base contains
 * @returns Tool definition that Nova Sonic can understand
 */
export function createKnowledgeBaseTool(
  knowledgeBaseId: string,
  toolName: string,
  description: string
): ToolDefinition {
  return {
    name: toolName,
    // Description is important: Nova Sonic uses it to decide WHEN to use this tool
    // We keep it neutral - no mention of "searching" or "looking up"
    description: description,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The information needed to answer the question'
        }
      },
      required: ['query']
    }
  };
}

/**
 * Generate tool name from knowledge base configuration
 * Converts spaces to underscores and makes lowercase
 * 
 * Example: "Company Policies" -> "company_policies"
 * 
 * @param name - Human-readable knowledge base name
 * @returns Safe tool name for Nova Sonic
 */
function generateToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
}

/**
 * Get all enabled knowledge base tools from configuration
 * 
 * This function:
 * 1. Reads your integration.knowledgeBases configuration
 * 2. Filters to only enabled knowledge bases
 * 3. Creates a tool definition for each one
 * 
 * @returns Array of tool definitions ready to send to Nova Sonic
 */
export function getEnabledKnowledgeBaseTools(): ToolDefinition[] {
  const correlationId = CorrelationIdManager.getCurrentCorrelationId();
  
  try {
    // Get knowledge base configurations
    const knowledgeBases = configManager.integration?.knowledgeBases || [];
    
    if (!knowledgeBases || knowledgeBases.length === 0) {
      logger.info('No knowledge bases configured', { correlationId });
      return [];
    }
    
    // Filter to only enabled knowledge bases
    const enabledKBs = knowledgeBases.filter(kb => kb.enabled);
    
    if (enabledKBs.length === 0) {
      logger.info('No enabled knowledge bases found', { 
        correlationId,
        totalConfigured: knowledgeBases.length 
      });
      return [];
    }
    
    // Create a tool definition for each enabled knowledge base
    const tools = enabledKBs.map(kb => {
      // Generate a safe tool name
      const toolName = generateToolName(kb.name || kb.id);
      
      // Create a description that helps Nova Sonic understand what info is available
      // Note: We don't say "search this knowledge base" - we describe the content
      const description = kb.domain 
        ? `Information about ${kb.domain}`
        : `Information from ${kb.name || 'knowledge base'}`;
      
      logger.debug('Creating tool for knowledge base', {
        correlationId,
        knowledgeBaseId: kb.knowledgeBaseId,
        toolName,
        description
      });
      
      return createKnowledgeBaseTool(
        kb.knowledgeBaseId,
        toolName,
        description
      );
    });
    
    logger.info('Generated knowledge base tools', {
      correlationId,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name)
    });
    
    return tools;
    
  } catch (error) {
    logger.error('Failed to generate knowledge base tools', {
      correlationId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Return empty array on error - graceful degradation
    return [];
  }
}

/**
 * Get knowledge base ID from tool name
 * 
 * When Nova Sonic uses a tool, we need to know which knowledge base to query.
 * This function maps the tool name back to the knowledge base ID.
 * 
 * @param toolName - Tool name (e.g., 'company_policies')
 * @returns Knowledge base ID or null if not found
 */
export function getKnowledgeBaseIdFromToolName(toolName: string): string | null {
  const correlationId = CorrelationIdManager.getCurrentCorrelationId();
  
  try {
    const knowledgeBases = configManager.integration?.knowledgeBases || [];
    const enabledKBs = knowledgeBases.filter(kb => kb.enabled);
    
    // Find the knowledge base that matches this tool name
    const matchingKB = enabledKBs.find(kb => {
      const expectedToolName = generateToolName(kb.name || kb.id);
      return expectedToolName === toolName;
    });
    
    if (!matchingKB) {
      logger.warn('No knowledge base found for tool', {
        correlationId,
        toolName,
        availableKBs: enabledKBs.map(kb => ({
          name: kb.name,
          toolName: generateToolName(kb.name || kb.id)
        }))
      });
      return null;
    }
    
    logger.debug('Mapped tool to knowledge base', {
      correlationId,
      toolName,
      knowledgeBaseId: matchingKB.knowledgeBaseId
    });
    
    return matchingKB.knowledgeBaseId;
    
  } catch (error) {
    logger.error('Error mapping tool name to knowledge base', {
      correlationId,
      toolName,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return null;
  }
}

/**
 * Validate that tools are properly configured
 * 
 * @returns Object with validation result and any issues found
 */
export function validateToolConfiguration(): {
  isValid: boolean;
  issues: string[];
  toolCount: number;
} {
  const issues: string[] = [];
  
  try {
    const knowledgeBases = configManager.integration?.knowledgeBases || [];
    const enabledKBs = knowledgeBases.filter(kb => kb.enabled);
    
    if (enabledKBs.length === 0) {
      issues.push('No enabled knowledge bases configured for tool use');
    }
    
    // Check for duplicate tool names
    const toolNames = enabledKBs.map(kb => generateToolName(kb.name || kb.id));
    const uniqueNames = new Set(toolNames);
    
    if (toolNames.length !== uniqueNames.size) {
      issues.push('Duplicate tool names detected - knowledge base names must be unique');
    }
    
    // Check that each KB has required fields
    enabledKBs.forEach(kb => {
      if (!kb.knowledgeBaseId) {
        issues.push(`Knowledge base "${kb.name || kb.id}" missing knowledgeBaseId`);
      }
      if (!kb.name && !kb.id) {
        issues.push('Knowledge base missing both name and id');
      }
    });
    
    return {
      isValid: issues.length === 0,
      issues,
      toolCount: enabledKBs.length
    };
    
  } catch (error) {
    issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      isValid: false,
      issues,
      toolCount: 0
    };
  }
}
