const crypto = require('crypto');

/**
 * @typedef {import('../types/index.js').Difficulty} Difficulty
 * @typedef {import('../types/index.js').Question} Question
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a random integer between min and max (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Randomly select an element from an array.
 * @param {Array} array
 * @returns {*}
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Evaluate a binary operation.
 * @param {number} a
 * @param {string} op
 * @param {number} b
 * @returns {number}
 */
function evaluate(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b !== 0 ? a / b : 1; // Avoid division by zero
    default: throw new Error(`Unknown operation: ${op}`);
  }
}

// ============================================================================
// Question Generation Functions
// ============================================================================

/**
 * Generate an easy question: operands 1-20, operations +/-, integer results.
 * @returns {Question}
 */
function generateEasy() {
  const operations = ['+', '-'];
  const operation = randomChoice(operations);
  
  let operand1, operand2, answer;
  
  if (operation === '+') {
    operand1 = randomInt(1, 20);
    operand2 = randomInt(1, 20);
    answer = operand1 + operand2;
  } else { // subtraction
    // Ensure non-negative result
    operand1 = randomInt(1, 20);
    operand2 = randomInt(1, operand1);
    answer = operand1 - operand2;
  }
  
  const expression = `${operand1} ${operation} ${operand2}`;
  
  return {
    id: crypto.randomUUID(),
    expression,
    answer,
    difficulty: 'easy',
    isInteger: true
  };
}

/**
 * Generate a medium question: operands 1-100, all four operations, integer division results.
 * @returns {Question}
 */
function generateMedium() {
  const operations = ['+', '-', '*', '/'];
  const operation = randomChoice(operations);
  
  let operand1, operand2, answer;
  
  switch (operation) {
    case '+':
      operand1 = randomInt(1, 100);
      operand2 = randomInt(1, 100);
      answer = operand1 + operand2;
      break;
    
    case '-':
      operand1 = randomInt(1, 100);
      operand2 = randomInt(1, operand1);
      answer = operand1 - operand2;
      break;
    
    case '*':
      operand1 = randomInt(1, 100);
      operand2 = randomInt(1, 100);
      answer = operand1 * operand2;
      break;
    
    case '/':
      // Generate division with integer result
      // Ensure operand1 stays within range by limiting quotient
      operand2 = randomInt(1, 100);
      const maxQuotient = Math.floor(100 / operand2);
      const quotient = randomInt(1, Math.max(1, maxQuotient));
      operand1 = operand2 * quotient;
      answer = quotient;
      break;
  }
  
  const expression = `${operand1} ${operation} ${operand2}`;
  
  return {
    id: crypto.randomUUID(),
    expression,
    answer,
    difficulty: 'medium',
    isInteger: true
  };
}

/**
 * Generate a hard question: operands 1-1000, multi-step expressions with ≥2 operations.
 * @returns {Question}
 */
function generateHard() {
  const operations = ['+', '-', '*', '/'];
  
  // Generate 2-3 operations
  const numOperations = randomInt(2, 3);
  const operands = [];
  const ops = [];
  
  // Generate operands and operations
  for (let i = 0; i <= numOperations; i++) {
    operands.push(randomInt(1, 1000));
  }
  
  for (let i = 0; i < numOperations; i++) {
    ops.push(randomChoice(operations));
  }
  
  // Build expression with proper operator precedence
  // Strategy: use parentheses to ensure deterministic evaluation
  let expression;
  let answer;
  
  if (numOperations === 2) {
    // Format: (a op1 b) op2 c
    const intermediate = evaluate(operands[0], ops[0], operands[1]);
    answer = evaluate(intermediate, ops[1], operands[2]);
    expression = `(${operands[0]} ${ops[0]} ${operands[1]}) ${ops[1]} ${operands[2]}`;
  } else { // numOperations === 3
    // Format: ((a op1 b) op2 c) op3 d
    const intermediate1 = evaluate(operands[0], ops[0], operands[1]);
    const intermediate2 = evaluate(intermediate1, ops[1], operands[2]);
    answer = evaluate(intermediate2, ops[2], operands[3]);
    expression = `((${operands[0]} ${ops[0]} ${operands[1]}) ${ops[1]} ${operands[2]}) ${ops[2]} ${operands[3]}`;
  }
  
  // Hard questions may have non-integer results
  const isInteger = Number.isInteger(answer);
  
  return {
    id: crypto.randomUUID(),
    expression,
    answer,
    difficulty: 'hard',
    isInteger
  };
}

/**
 * Generate a question based on difficulty.
 * @param {Difficulty} difficulty
 * @returns {Question}
 */
function generateQuestionByDifficulty(difficulty) {
  switch (difficulty) {
    case 'easy':
      return generateEasy();
    case 'medium':
      return generateMedium();
    case 'hard':
      return generateHard();
    default:
      throw new Error(`Unknown difficulty: ${difficulty}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a new question at the specified difficulty level.
 * Ensures consecutive questions differ to maintain engagement.
 * 
 * @param {Difficulty} difficulty - The difficulty level
 * @param {Question | null} previousQuestion - The previous question to avoid duplicates
 * @returns {Question} A new question object
 */
function generateQuestion(difficulty, previousQuestion = null) {
  let question;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    question = generateQuestionByDifficulty(difficulty);
    attempts++;
    
    // Ensure the new question differs from the previous one
    if (!previousQuestion || question.expression !== previousQuestion.expression) {
      break;
    }
    
    if (attempts >= maxAttempts) {
      // Fallback: force a different question by adding 1 to the first operand
      break;
    }
  } while (true);

  return question;
}

module.exports = {
  generateQuestion
};
