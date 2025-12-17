/**
 * Snippet Parser Service
 *
 * Uses OpenAI to extract structured prospect data from Google search snippets.
 */

import OpenAI from 'openai';
import type { GoogleSearchResult } from '../types/index.js';
import type { ProspectFromSnippet } from '../models/index.js';

/**
 * OpenAI prompt for parsing LinkedIn search snippets
 */
const SNIPPET_PARSER_PROMPT = `You are a data extraction assistant. Your task is to parse Google search results for LinkedIn profiles and extract structured prospect information.

For each LinkedIn search result, extract the following fields:
- name: Full name of the person (from title or snippet)
- organization: Company/organization they work for
- title: Job title or role
- location: Geographic location (city, state, country)
- linkedin_url: The LinkedIn profile URL

Return a JSON object with these fields. If a field cannot be determined from the snippet, set it to null.

Be as accurate as possible. Extract information only from what is explicitly stated in the search result.`;

/**
 * Snippet Parser Service Class
 */
export class SnippetParserService {
  private openaiClient: OpenAI;
  private model: string;

  /**
   * Initialize the snippet parser service
   *
   * @param openaiApiKey - OpenAI API key
   * @param model - OpenAI model to use (default: gpt-4o-mini)
   */
  constructor(openaiApiKey: string, model: string = 'gpt-4o-mini') {
    this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
    this.model = model;
  }

  /**
   * Parse a single Google search result into structured prospect data
   *
   * @param searchResult - Google Custom Search result
   * @returns Parsed prospect data
   */
  async parseSnippet(searchResult: GoogleSearchResult): Promise<ProspectFromSnippet | null> {
    try {
      const userMessage = `
LinkedIn Search Result:

Title: ${searchResult.title || 'N/A'}
URL: ${searchResult.link || 'N/A'}
Snippet: ${searchResult.snippet || 'N/A'}
Display Link: ${searchResult.displayLink || 'N/A'}

Extract the prospect information from this search result.`;

      const completion = await this.openaiClient.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SNIPPET_PARSER_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.0,
        response_format: { type: 'json_object' },
      });

      const rawResponse = completion.choices[0]?.message?.content;

      if (!rawResponse) {
        console.error('OpenAI returned empty response for snippet parsing');
        return null;
      }

      const parsed = JSON.parse(rawResponse) as Partial<ProspectFromSnippet>;

      // Validate that we at least have a name and LinkedIn URL
      if (!parsed.name || !parsed.linkedin_url) {
        console.warn('Parsed snippet missing required fields:', parsed);
        return null;
      }

      return {
        name: parsed.name,
        organization: parsed.organization || undefined,
        title: parsed.title || undefined,
        location: parsed.location || undefined,
        linkedin_url: parsed.linkedin_url,
        snippet_text: searchResult.snippet,
      };
    } catch (error) {
      console.error('Error parsing snippet with OpenAI:', error);
      return null;
    }
  }

  /**
   * Parse multiple Google search results in batch
   *
   * @param searchResults - Array of Google Custom Search results
   * @returns Array of parsed prospects (null entries filtered out)
   */
  async parseSnippets(searchResults: GoogleSearchResult[]): Promise<ProspectFromSnippet[]> {
    const parsePromises = searchResults.map((result) => this.parseSnippet(result));
    const results = await Promise.all(parsePromises);

    // Filter out null results
    return results.filter((result): result is ProspectFromSnippet => result !== null);
  }

  /**
   * Parse snippets with error tracking
   *
   * @param searchResults - Array of Google Custom Search results
   * @returns Object with successful prospects and errors
   */
  async parseSnippetsWithErrors(
    searchResults: GoogleSearchResult[]
  ): Promise<{
    prospects: ProspectFromSnippet[];
    errors: Array<{ index: number; error: string }>;
  }> {
    const prospects: ProspectFromSnippet[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < searchResults.length; i++) {
      try {
        const result = await this.parseSnippet(searchResults[i]);
        if (result) {
          prospects.push(result);
        } else {
          errors.push({
            index: i,
            error: 'Failed to extract required fields (name or LinkedIn URL)',
          });
        }
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { prospects, errors };
  }
}
