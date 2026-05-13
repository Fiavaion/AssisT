/**
 * AI Sub-Agent Invocation System
 * Phase 2 - Automation Helper
 *
 * This module provides helper functions for invoking AI sub-agents
 * to autonomously complete Phase 2 tasks following the task-agent-config.json
 * configuration.
 *
 * @module agent-invoker
 */

import taskAgentConfig from '../../docs/planning/task-agent-config.json';

/**
 * Get agent configuration for a specific task
 * @param {string} taskId - Task ID (e.g., "5.1-5.3")
 * @returns {Object|null} Task configuration or null if not found
 */
export function getTaskAgentConfig(taskId) {
  const config = taskAgentConfig.tasks[taskId];
  if (!config) {
    console.warn(`[AgentInvoker] No agent configuration found for task: ${taskId}`);
    return null;
  }
  return config;
}

/**
 * Check if a task requires a sub-agent
 * @param {string} taskId - Task ID
 * @returns {boolean} True if task requires agent
 */
export function taskRequiresAgent(taskId) {
  const config = getTaskAgentConfig(taskId);
  return config ? config.requiresAgent : false;
}

/**
 * Invoke a sub-agent for a specific task
 * @param {string} taskId - Task ID
 * @returns {Object} Agent invocation result
 */
export async function invokeSubAgent(taskId) {
  const config = getTaskAgentConfig(taskId);

  if (!config) {
    return {
      success: false,
      error: `No configuration found for task: ${taskId}`,
      taskId,
    };
  }

  if (!config.requiresAgent) {
    return {
      success: false,
      error: `Task ${taskId} does not require an agent`,
      taskId,
    };
  }

  // Check dependencies
  if (config.dependencies && config.dependencies.length > 0) {
    const unmetDependencies = await checkDependencies(config.dependencies);
    if (unmetDependencies.length > 0) {
      return {
        success: false,
        error: `Unmet dependencies: ${unmetDependencies.join(', ')}`,
        taskId,
        unmetDependencies,
      };
    }
  }

  console.log(`[AgentInvoker] Invoking ${config.agentType} agent for task ${taskId}`);
  console.log(`[AgentInvoker] Thoroughness: ${config.thoroughness}`);
  console.log(`[AgentInvoker] Estimated time: ${config.estimatedTime}`);

  // In a real implementation, this would call the Task tool with the configured agent
  // For now, return the configuration for the developer to invoke manually
  return {
    success: true,
    taskId,
    featureId: config.featureId,
    featureName: config.featureName,
    taskName: config.taskName,
    agentType: config.agentType,
    thoroughness: config.thoroughness,
    prompt: config.agentPrompt,
    estimatedTime: config.estimatedTime,
    testStrategy: config.testStrategy,
    files: config.files,
    message: 'Agent configuration ready. Invoke using Task tool manually.',
  };
}

/**
 * Check if task dependencies are met
 * @param {string[]} _dependencies - Array of task IDs
 * @returns {Promise<string[]>} Array of unmet dependency task IDs
 */
async function checkDependencies(_dependencies) {
  // In a real implementation, this would check task completion status
  // For now, assume all dependencies are met
  // TODO: Integrate with PHASE2_TASKS.md parser to check task status
  return [];
}

/**
 * Get all tasks that require agents
 * @returns {Object[]} Array of task configurations
 */
export function getAllAgentTasks() {
  return Object.values(taskAgentConfig.tasks).filter(task => task.requiresAgent);
}

/**
 * Get tasks by feature ID
 * @param {string} featureId - Feature ID (e.g., "5", "11.1")
 * @returns {Object[]} Array of task configurations
 */
export function getTasksByFeature(featureId) {
  return Object.values(taskAgentConfig.tasks).filter(task => task.featureId === featureId);
}

/**
 * Get agent statistics
 * @returns {Object} Statistics about agent tasks
 */
export function getAgentStats() {
  const tasks = Object.values(taskAgentConfig.tasks);

  return {
    totalTasks: tasks.length,
    agentTasks: tasks.filter(t => t.requiresAgent).length,
    manualTasks: tasks.filter(t => !t.requiresAgent).length,
    byAgentType: {
      'general-purpose': tasks.filter(t => t.agentType === 'general-purpose').length,
      Explore: tasks.filter(t => t.agentType === 'Explore').length,
      Plan: tasks.filter(t => t.agentType === 'Plan').length,
    },
    byThoroughness: {
      quick: tasks.filter(t => t.thoroughness === 'quick').length,
      medium: tasks.filter(t => t.thoroughness === 'medium').length,
      'very thorough': tasks.filter(t => t.thoroughness === 'very thorough').length,
    },
    byTestStrategy: {
      unit: tasks.filter(t => t.testStrategy === 'unit').length,
      e2e: tasks.filter(t => t.testStrategy === 'e2e').length,
      integration: tasks.filter(t => t.testStrategy?.includes('integration')).length,
      accessibility: tasks.filter(t => t.testStrategy?.includes('accessibility')).length,
    },
  };
}

/**
 * Format agent invocation prompt for Claude Code
 * @param {string} taskId - Task ID
 * @returns {string} Formatted prompt for Task tool
 */
export function formatAgentPrompt(taskId) {
  const config = getTaskAgentConfig(taskId);

  if (!config) {
    return `Error: No configuration found for task ${taskId}`;
  }

  return `
Task ID: ${config.taskId}
Feature: ${config.featureName}
Task: ${config.taskName}
Agent Type: ${config.agentType}
Thoroughness: ${config.thoroughness}
Estimated Time: ${config.estimatedTime}
Test Strategy: ${config.testStrategy}

Files to Create/Modify:
${config.files.map(f => `- ${f}`).join('\n')}

Prompt:
${config.agentPrompt}

Dependencies: ${config.dependencies.length > 0 ? config.dependencies.join(', ') : 'None'}
`.trim();
}

/**
 * Log agent invocation for tracking
 * @param {string} taskId - Task ID
 * @param {Object} result - Agent result
 */
export function logAgentInvocation(taskId, result) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    taskId,
    success: result.success,
    agentType: result.agentType,
    error: result.error,
  };

  console.log(
    `[AgentInvoker] ${timestamp} - Task ${taskId}:`,
    result.success ? 'SUCCESS' : 'FAILED'
  );

  // In a real implementation, this would write to a log file
  // For now, just console log
  return logEntry;
}

/**
 * Validate agent result
 * @param {string} taskId - Task ID
 * @param {Object} result - Agent result
 * @returns {Object} Validation result
 */
export function validateAgentResult(taskId, result) {
  const config = getTaskAgentConfig(taskId);

  if (!config) {
    return {
      valid: false,
      errors: [`No configuration found for task ${taskId}`],
    };
  }

  const errors = [];

  // Check if all required files were created/modified
  if (result.files) {
    const missingFiles = config.files.filter(file => !result.files.includes(file));
    if (missingFiles.length > 0) {
      errors.push(`Missing files: ${missingFiles.join(', ')}`);
    }
  }

  // Check if tests were created
  if (config.testStrategy && !result.testsCreated) {
    errors.push(`No tests created (expected: ${config.testStrategy})`);
  }

  // Check if WCAG compliance was validated
  if (config.agentPrompt.includes('WCAG') && !result.wcagCompliant) {
    errors.push('WCAG compliance not validated');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

// Export default object with all functions
export default {
  getTaskAgentConfig,
  taskRequiresAgent,
  invokeSubAgent,
  getAllAgentTasks,
  getTasksByFeature,
  getAgentStats,
  formatAgentPrompt,
  logAgentInvocation,
  validateAgentResult,
};
