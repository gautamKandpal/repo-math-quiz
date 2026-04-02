/**
 * AnswerValidator Module
 * 
 * Validates user submissions against question answers.
 * Pure, stateless, idempotent function.
 * 
 * Requirements: 2.3, 2.4, 2.5
 */

const { ValidationResult, Question } = require('../types');

/**
 * Validates a user's answer submission against the correct answer.
 * 
 * @param {string} submission - Raw user input string
 * @param {Question} question - Question object with answer and isInteger flag
 * @returns {ValidationResult} Validation result with correct flag and parsed value
 * 
 * Validation rules:
 * - Parse submission as a number; if parsing fails → { correct: false, parsed: null }
 * - If question.isInteger: correct iff parsed === question.answer (exact match)
 * - Otherwise: correct iff Math.abs(parsed - question.answer) <= 0.01 (tolerance)
 * 
 * Pure function: no side effects, same inputs always produce same output.
 */
function validateAnswer(submission, question) {
  // Parse submission string to number
  const parsed = parseFloat(submission);
  
  // Return parsed: null if parsing failed
  if (isNaN(parsed) || !isFinite(parsed)) {
    return {
      correct: false,
      parsed: null
    };
  }
  
  // For integer questions: exact match validation (Requirement 2.4)
  if (question.isInteger) {
    return {
      correct: parsed === question.answer,
      parsed: parsed
    };
  }
  
  // For non-integer questions: tolerance-based validation ±0.01 (Requirement 2.5)
  const tolerance = 0.01;
  const isCorrect = Math.abs(parsed - question.answer) <= tolerance;
  
  return {
    correct: isCorrect,
    parsed: parsed
  };
}

module.exports = {
  validateAnswer
};
