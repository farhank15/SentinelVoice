import mockExecutives from '../data/mockExecutives.json' with { type: 'json' };

export class ChallengeService {
  static issueSecurityChallenge(executiveName = 'Robert Sterling') {
    const searchName = String(executiveName).toLowerCase();
    const exec = mockExecutives.executives.find((e) =>
      e.name.toLowerCase().includes(searchName) || searchName.includes(e.name.toLowerCase().split(' ')[0])
    ) || mockExecutives.executives[0];

    const randomChallenge = exec.challenges[Math.floor(Math.random() * exec.challenges.length)];

    return {
      executive_id: exec.id,
      executive_name: exec.name,
      title: exec.title,
      challenge_id: randomChallenge.challenge_id,
      challenge_question: randomChallenge.question,
      instruction_for_agent: `Ask this confidential verification question directly to the caller to verify their genuine identity: "${randomChallenge.question}". If the caller deflects, refuses to answer, or threatens termination, mark challenge as FAILED.`
    };
  }

  static validateAnswer(executiveName, answerText) {
    const searchName = String(executiveName).toLowerCase();
    const exec = mockExecutives.executives.find((e) =>
      e.name.toLowerCase().includes(searchName)
    ) || mockExecutives.executives[0];

    const lowerAnswer = String(answerText || '').toLowerCase();
    let passed = false;
    let matchedKeyword = null;

    for (const c of exec.challenges) {
      for (const kw of c.valid_keywords) {
        if (lowerAnswer.includes(kw.toLowerCase())) {
          passed = true;
          matchedKeyword = kw;
          break;
        }
      }
      if (passed) break;
    }

    return {
      passed,
      matched_keyword: matchedKeyword,
      answer_received: answerText,
      evaluation: passed
        ? "Answer successfully authenticated against executive zero-knowledge secret."
        : "Answer incorrect or evasive. Caller failed cryptographic challenge."
    };
  }
}
