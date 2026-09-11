export const maxDuration = 60;
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed bhai!' });

  const { chunk, difficulty } = req.body;

  // 1. TERA FULL PROMPT (Zero Truncation)
  const diffInst = difficulty === 'easy_mod' 
      ? "EASY-TO-MODERATE LEVEL: Use the original question strictly as a hardcoded skeleton. For Quant/Reasoning, just change numbers, names, and data values but keep the exact logic. For English/GK, change the sentence/context but test the exact same grammar rule or specific factual topic. Maintain the original complexity."
      : "MODERATE-TO-HARD LEVEL: Push the boundaries! Create pro-level CGL/CDS traps based strictly on the original topic. For Quant: Multi-step calculations. For English: Tricky exceptions, cloze/parajumble twists. For GK: Statement-based or in-depth conceptual questions (e.g., 'Which of the following is NOT correct'). For Reasoning: Hidden patterns. Do NOT go out of context from the original topic.";

  const systemPrompt = `You are the Ultimate Expert Exam Setter & Analytical Engine for SSC CGL, CDS, and Railways.
Your persona for the explanation ("s" key) is Aman bhaiya (engaging conversational Hinglish, e.g., "Dekh bhai aise karna hai...").

CRITICAL EXECUTION METHOD (1-to-1 Mapping):
Do not process the input as a generic batch. You must look at the input JSON array question-by-question. For EACH original question, identify its subject (Quant, English, Reasoning, or GK) and generate exactly ONE corresponding variation based on the difficulty directive. If the input has 5 questions, your output MUST be a valid JSON array of exactly 5 questions.
ZERO SUBJECT LEAKAGE: You MUST rigorously identify the subject of the original input question. If the original question is Mathematics/Quant, your output MUST be Mathematics/Quant. NEVER insert Polity, GK, or English questions into a Math/Quant batch.

DIFFICULTY DIRECTIVE:
${diffInst}

SUBJECT-SPECIFIC RULES:
- QUANTITATIVE APTITUDE: Emphasize 'Pen-Free Observation'. You MUST EXPLICITLY state which of the 5 Core Conceptual Tools (1. CPR, 2. Successive Change, 3. JSM/Deviation, 4. Cross-Product, 5. Unitary Scaling) applies before showing the calculation.
- ENGLISH COMPREHENSION (Grammar, Fillers, Cloze, Parajumbles): Test the exact same rule/concept as the original. Provide a detailed grammatical breakdown in the solution.
- REASONING: Keep the same logical pattern (e.g., coding-decoding, number series) but apply it to new elements. Make the logic airtight.
- GK/GS: Stay STRICTLY within the original topic boundary. If the original asks about Article 32, ask a harder/different fact about Article 32. Do NOT hallucinate random out-of-context topics.

STRICT JSON & FORMATTING RULES (CRITICAL FOR UI PARSING):
1. OUTPUT FORMAT: ONLY output a valid JSON array. NO markdown wrappers (DO NOT use \`\`\`json).
2. KEYS: Keep exact keys: "q" (Question), "o" (Array of exactly 4 Options), "a" (Correct Index 0-3), "s" (Explanation in Hinglish).
3. STRUCTURAL SPACING: You MUST explicitly use double line breaks (<br><br>) to separate distinct logical parts inside "q" and "s" (e.g., separating direction text from statements or data series).
4. RICH TEXT EMPHASIS: Intelligently use <b>...</b> to bold crucial trap words (NOT, INCORRECT) and key data. Use properly escaped quotes (\\"...\\").
5. MATH & LATEX: ALL math equations, numbers, fractions, and symbols MUST use double-escaped LaTeX (e.g., \\\\frac{x}{y}, $A \\\\times B$). DO NOT use single backslashes.`;

  const fullPromptForGemini = systemPrompt + "\n\nINPUT JSON:\n" + JSON.stringify(chunk);
  let lastError = null;

  // 2. THE MULTI-PROVIDER MATRIX
  // Yahan hum alag-alag companies ki keys, unke models, aur unka call karne ka 'format' set kar rahe hain.
  const providers = [
    {
      name: "Google_Gemini",
      key: process.env.GEMINI_API_KEY_1,
      models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"],
      format: "gemini"
    },
    {
      name: "DeepSeek_Grok_via_OpenRouter", 
      key: process.env.OPENROUTER_API_KEY, // Jab OpenRouter ki key layega, toh Vercel me is naam se save karna
      models: ["deepseek/deepseek-chat", "x-ai/grok-2"],
      format: "openai" // DeepSeek aur Grok standard OpenAI format support karte hain
    }
  ];

  // 3. FAILOVER LOGIC EXECUTION
  for (let p = 0; p < providers.length; p++) {
    const provider = providers[p];
    
    // Agar Vercel me is provider ki key set nahi hai, toh ise skip kar dega
    if (!provider.key) continue; 

    for (let m = 0; m < provider.models.length; m++) {
      const model = provider.models[m];
      
      try {
        let response, rawText;

        // Agar model Google ka hai, toh Gemini ka API format use karega
        if (provider.format === "gemini") {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.key}`;
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPromptForGemini }] }],
              generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
            })
          });

          if (!response.ok) throw new Error(await response.text());
          const data = await response.json();
          rawText = data.candidates[0].content.parts[0].text;
        } 
        // Agar model DeepSeek/Grok ka hai, toh OpenAI format use karega
        else if (provider.format === "openai") {
          const endpoint = "https://openrouter.ai/api/v1/chat/completions";
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${provider.key}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify(chunk) }
              ],
              temperature: 0.8
            })
          });

          if (!response.ok) throw new Error(await response.text());
          const data = await response.json();
          rawText = data.choices[0].message.content;
        }

        // AI se text aaya, usko saaf kiya aur valid JSON banaya
        const cleanJson = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
        
        // Success! Seedha frontend ko clean array bhej do
        return res.status(200).json(cleanJson);

      } catch (error) {
        lastError = error.message;
        console.warn(`[Failover Activated] ${provider.name} failed on model ${model}. Moving to next...`);
        // Ye catch block loop ko tutne nahi dega, agla model try karega
      }
    }
  }

  // Agar dono companies ke saare models fail ho gaye
  return res.status(500).json({ error: 'Saare providers aur models exhaust ho gaye! Vercel logs check kar.', details: lastError });
}
