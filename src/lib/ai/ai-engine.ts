import type { AIGenerationRequest, AIGenerationResponse } from '@/types';

/**
 * DocMint AI Engine
 * Powers content generation, rewriting, translation, and auto-fill.
 */
export class AIEngine {
  private static apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '';
  private static provider = process.env.OPENAI_API_KEY ? 'openai' : 'gemini';

  /**
   * Generate content based on prompt
   */
  static async generate(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    try {
      const prompt = this.buildPrompt(request);

      if (this.provider === 'openai') {
        return this.callOpenAI(prompt, request);
      } else {
        return this.callGemini(prompt, request);
      }
    } catch (error) {
      console.error('AI generation error:', error);
      // Return a fallback response instead of failing
      return {
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  /**
   * Generate an AI-powered offer letter
   */
  static async generateOfferLetter(employeeData: Record<string, string>): Promise<string> {
    const prompt = `Generate a professional offer letter for ${employeeData.EmployeeName || 'the candidate'} 
      joining as ${employeeData.Designation || 'employee'} at ${employeeData.CompanyName || 'the company'}.
      Include: position, start date ${employeeData.JoiningDate || ''}, 
      salary ${employeeData.Salary || ''}, and standard terms.
      Format as a formal business letter.`;

    const result = await this.generate({
      prompt,
      type: 'content',
      tone: 'formal',
    });

    return result.content;
  }

  /**
   * Generate an AI-powered invoice
   */
  static async generateInvoice(items: string[], clientName: string): Promise<string> {
    const prompt = `Generate a professional invoice for ${clientName} with the following items: ${items.join(', ')}.
      Include invoice number, date, item descriptions, quantities, rates, subtotal, tax (18% GST), and total.
      Format as a clean, professional invoice.`;

    const result = await this.generate({
      prompt,
      type: 'content',
      tone: 'formal',
    });

    return result.content;
  }

  /**
   * Generate job description
   */
  static async generateJobDescription(
    title: string,
    department: string,
    skills: string[]
  ): Promise<string> {
    const prompt = `Write a detailed job description for a ${title} position in the ${department} department.
      Required skills: ${skills.join(', ')}.
      Include: job summary, responsibilities, requirements, qualifications, and benefits.`;

    const result = await this.generate({
      prompt,
      type: 'content',
      tone: 'professional',
    });

    return result.content;
  }

  /**
   * Rewrite content with specified tone
   */
  static async rewrite(
    content: string,
    tone: 'formal' | 'professional' | 'friendly' | 'persuasive'
  ): Promise<string> {
    const prompt = `Rewrite the following content in a ${tone} tone:\n\n${content}`;

    const result = await this.generate({
      prompt,
      type: 'rewrite',
      tone,
    });

    return result.content;
  }

  /**
   * Translate content
   */
  static async translate(
    content: string,
    targetLanguage: string
  ): Promise<string> {
    const prompt = `Translate the following content to ${targetLanguage}:\n\n${content}`;

    const result = await this.generate({
      prompt,
      type: 'translate',
      language: targetLanguage,
    });

    return result.content;
  }

  /**
   * Fix grammar in content
   */
  static async correctGrammar(content: string): Promise<string> {
    const prompt = `Fix the grammar, spelling, and punctuation in the following text. 
      Keep the same meaning and tone:\n\n${content}`;

    const result = await this.generate({
      prompt,
      type: 'grammar',
    });

    return result.content;
  }

  /**
   * Summarize content
   */
  static async summarize(content: string): Promise<string> {
    const prompt = `Summarize the following content in 3-5 bullet points:\n\n${content}`;

    const result = await this.generate({
      prompt,
      type: 'summary',
    });

    return result.content;
  }

  /**
   * Auto-fill document variables from context
   */
  static async autoFill(
    placeholders: string[],
    context: Record<string, string>
  ): Promise<Record<string, string>> {
    const prompt = `Given the following context information:
      ${JSON.stringify(context, null, 2)}
      
      Fill in values for these placeholders: ${placeholders.join(', ')}
      Return only valid JSON with placeholder names as keys and appropriate values.
      Use realistic business document values.`;

    const result = await this.generate({ prompt, type: 'autofill' });

    try {
      const parsed = JSON.parse(result.content);
      return parsed;
    } catch {
      return {};
    }
  }

  /**
   * Build the prompt based on request type
   */
  private static buildPrompt(request: AIGenerationRequest): string {
    const toneMap: Record<string, string> = {
      formal: 'Use formal, professional language suitable for business documents.',
      professional: 'Use clear, professional language.',
      friendly: 'Use warm, friendly language.',
      persuasive: 'Use persuasive, compelling language.',
    };

    let systemPrompt = `You are DocMint AI, a professional business document writing assistant. 
      ${toneMap[request.tone || 'professional'] || toneMap.professional}
      Generate clean, well-formatted business content.`;

    return `${systemPrompt}\n\n${request.prompt}`;
  }

  /**
   * Call OpenAI API
   */
  private static async callOpenAI(
    prompt: string,
    request: AIGenerationRequest
  ): Promise<AIGenerationResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Call Gemini API
   */
  private static async callGemini(
    prompt: string,
    _request: AIGenerationRequest
  ): Promise<AIGenerationResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    };
  }
}
