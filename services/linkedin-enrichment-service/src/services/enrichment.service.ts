/**
 * LinkedIn Enrichment Service
 *
 * Core service that orchestrates the LinkedIn profile enrichment process:
 * 1. Generate search keywords from prospect data
 * 2. Query Google Custom Search API
 * 3. Use OpenAI to evaluate and select the best LinkedIn profile
 * 4. Return structured results for Firestore storage
 */

import axios from 'axios';
import OpenAI from 'openai';
import type {
  KeywordConfig,
  ProspectData,
  GoogleSearchResult,
  EnrichmentResult,
  EnrichmentStatus,
  OpenAIEvaluation,
} from '../types/index.js';

/**
 * Default keyword configuration
 * Uses name, organization, and "site:linkedin.com/in" for best results
 */
const DEFAULT_KEYWORD_CONFIG: KeywordConfig = {
  includeName: true,
  includeOrganization: true,
  includeTitle: false,
  includeLocation: false,
  additionalKeywords: ['site:linkedin.com/in'],
};

/**
 * Default OpenAI prompt for LinkedIn profile evaluation
 */
const DEFAULT_OPENAI_PROMPT = `You are an expert at identifying the correct LinkedIn profile for a person based on search results.

Given a search query and a list of Google search results, analyze each result and determine which one is the best match for the person's LinkedIn profile.

Return a JSON object with the following structure:
{
  "linkedin_url": "the full LinkedIn profile URL" or null,
  "match_result": "found" | "not available" | "ambiguous",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of your decision"
}

Guidelines:
- Only select a result if you're confident it's the correct person
- Consider organization, job title, and location to validate the match
- If multiple profiles could be the same person, set match_result to "ambiguous"
- If no results match or no LinkedIn profiles found, set match_result to "not available"
- Always return valid JSON`;

/**
 * LinkedIn Enrichment Service Class
 */
export class LinkedInEnrichmentService {
  private openaiClient: OpenAI;
  private googleApiKey: string;
  private googleCseId: string;
  private openaiModel: string;

  /**
   * Initialize the enrichment service
   *
   * @param config - Service configuration
   * @param config.openaiApiKey - OpenAI API key
   * @param config.googleApiKey - Google Custom Search API key
   * @param config.googleCseId - Google Programmable Search Engine ID
   * @param config.openaiModel - OpenAI model to use (default: gpt-4o-mini)
   */
  constructor(config: {
    openaiApiKey: string;
    googleApiKey: string;
    googleCseId: string;
    openaiModel?: string;
  }) {
    this.openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
    this.googleApiKey = config.googleApiKey;
    this.googleCseId = config.googleCseId;
    this.openaiModel = config.openaiModel || 'gpt-4o-mini';
  }

  /**
   * Generate search keywords from prospect data
   *
   * Builds a search query string based on the keyword configuration.
   * Template example: "{name}" {organization} site:linkedin.com/in
   *
   * @param prospect - Prospect data from Firestore
   * @param config - Keyword configuration (uses defaults if not provided)
   * @returns Search query string
   */
  generateKeywords(
    prospect: ProspectData,
    config: KeywordConfig = DEFAULT_KEYWORD_CONFIG
  ): string {
    // Use custom template if provided
    if (config.customTemplate) {
      return config.customTemplate
        .replace('{name}', prospect.name || '')
        .replace('{organization}', prospect.organization || '')
        .replace('{title}', prospect.title || '')
        .replace('{location}', prospect.location || '')
        .trim();
    }

    // Build keywords from configuration
    const parts: string[] = [];

    if (config.includeName && prospect.name) {
      // Wrap name in quotes for exact phrase matching
      parts.push(`"${prospect.name}"`);
    }

    if (config.includeOrganization && prospect.organization) {
      parts.push(prospect.organization);
    }

    if (config.includeTitle && prospect.title) {
      parts.push(prospect.title);
    }

    if (config.includeLocation && prospect.location) {
      parts.push(prospect.location);
    }

    // Append additional static keywords (e.g., site:linkedin.com/in)
    if (config.additionalKeywords && config.additionalKeywords.length > 0) {
      parts.push(...config.additionalKeywords);
    }

    return parts.join(' ').trim();
  }

  /**
   * Fetch Google Custom Search results
   *
   * Queries the Google Custom Search API and returns up to maxResults items.
   * Implements automatic retry without quotes if no results are found.
   *
   * @param query - Search query string
   * @param maxResults - Maximum number of results to return (minimum: 1, default: 3)
   * @returns Array of search results
   * @throws Error if API call fails or configuration is invalid
   */
  async fetchGoogleResults(
    query: string,
    maxResults: number = 3
  ): Promise<GoogleSearchResult[]> {
    if (maxResults < 1) {
      throw new Error('maxResults must be at least 1');
    }

    if (maxResults > 100) {
      throw new Error('maxResults cannot exceed 100 (Google API limit)');
    }

    // Google API limit is 10 per request, so we need to paginate
    const resultsPerPage = 10;
    const numRequests = Math.ceil(maxResults / resultsPerPage);
    const allResults: GoogleSearchResult[] = [];

    try {
      for (let i = 0; i < numRequests; i++) {
        const startIndex = i * resultsPerPage + 1;
        const numToFetch = Math.min(resultsPerPage, maxResults - allResults.length);

        const params = {
          key: this.googleApiKey,
          cx: this.googleCseId,
          q: query,
          num: numToFetch,
          start: startIndex,
        };

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 15000,
        });

        const items = response.data.items || [];
        allResults.push(...items);

        // If we got fewer results than requested, no more pages available
        if (items.length < numToFetch) {
          break;
        }
      }

      // If no results and query has quotes, retry without quotes
      if (allResults.length === 0 && query.includes('"')) {
        const fallbackQuery = query.replace(/"/g, '').replace(/\s+/g, ' ').trim();
        console.log(`No results for "${query}", retrying with: ${fallbackQuery}`);

        const params = {
          key: this.googleApiKey,
          cx: this.googleCseId,
          q: fallbackQuery,
          num: Math.min(maxResults, 10),
        };

        const fallbackResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params,
          timeout: 15000,
        });

        return fallbackResponse.data.items || [];
      }

      return allResults;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Google API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Evaluate search results using OpenAI
   *
   * Sends the search query and Google results to OpenAI for analysis.
   * OpenAI determines which result (if any) is the best LinkedIn profile match.
   *
   * @param query - Original search query
   * @param results - Array of Google search results
   * @param customPrompt - Optional custom prompt (uses default if not provided)
   * @returns OpenAI evaluation response
   * @throws Error if API call fails or response is invalid
   */
  async evaluateWithOpenAI(
    query: string,
    results: GoogleSearchResult[],
    customPrompt?: string
  ): Promise<{ rawResponse: string; evaluation: OpenAIEvaluation | null }> {
    const systemPrompt = customPrompt || DEFAULT_OPENAI_PROMPT;

    // Format results for OpenAI
    const resultsJson = JSON.stringify(results, null, 2);

    const userMessage = `[Search Query]
${query}

[Google Search Results]
${resultsJson}

Analyze these results and determine the best LinkedIn profile match.`;

    try {
      const completion = await this.openaiClient.chat.completions.create({
        model: this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.0, // Deterministic output
        response_format: { type: 'json_object' }, // Force JSON response
      });

      const rawResponse = completion.choices[0]?.message?.content || '';

      if (!rawResponse) {
        throw new Error('OpenAI returned empty response');
      }

      // Parse JSON response
      const evaluation = this.parseOpenAIResponse(rawResponse);

      return { rawResponse, evaluation };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse OpenAI response text into structured evaluation object
   *
   * Handles various response formats and extracts the linkedin_url field.
   *
   * @param responseText - Raw response from OpenAI
   * @returns Parsed evaluation object or null if parsing fails
   */
  private parseOpenAIResponse(responseText: string): OpenAIEvaluation | null {
    try {
      const evaluation = JSON.parse(responseText) as OpenAIEvaluation;
      return evaluation;
    } catch {
      // Attempt to extract JSON from code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{.*\})\s*```/s);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as OpenAIEvaluation;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Extract LinkedIn URL from OpenAI evaluation
   *
   * Checks multiple possible field names and validates that the URL
   * contains "linkedin.com".
   *
   * @param evaluation - Parsed OpenAI evaluation
   * @returns LinkedIn URL or null if not found
   */
  private extractLinkedInUrl(evaluation: OpenAIEvaluation | null): string | null {
    if (!evaluation) return null;

    // Check common field names
    const candidates = [
      evaluation.linkedin_url,
      evaluation.url,
      evaluation.selected_link,
      evaluation.linkedinProfile,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.includes('linkedin.com')) {
        return candidate.trim();
      }
    }

    return null;
  }

  /**
   * Find first LinkedIn URL from Google results (fallback method)
   *
   * Scans search results and returns the first result that links to linkedin.com.
   *
   * @param results - Array of Google search results
   * @returns LinkedIn URL or null if none found
   */
  private findFirstLinkedInResult(results: GoogleSearchResult[]): string | null {
    for (const result of results) {
      if (result.link && result.link.includes('linkedin.com')) {
        return result.link.trim();
      }
    }
    return null;
  }

  /**
   * Determine enrichment status based on evaluation
   *
   * Maps OpenAI evaluation results to standardized status codes.
   *
   * @param evaluation - Parsed OpenAI evaluation
   * @param selectedUrl - The URL that was selected (if any)
   * @param usedFallback - Whether a fallback method was used
   * @returns Status code
   */
  private determineStatus(
    evaluation: OpenAIEvaluation | null,
    selectedUrl: string | null,
    usedFallback: boolean
  ): EnrichmentStatus {
    if (!selectedUrl) {
      if (!evaluation) return 'OPENAI_NO_JSON';

      const matchResult = evaluation.match_result?.toLowerCase();
      if (matchResult?.includes('not available')) return 'MODEL_NOT_AVAILABLE';
      if (matchResult?.includes('ambiguous')) return 'MODEL_AMBIGUOUS';

      return 'OPENAI_NO_LINK';
    }

    if (usedFallback) {
      return 'FALLBACK_LINKEDIN_RESULT';
    }

    return 'SUCCESS';
  }

  /**
   * Enrich a single prospect with LinkedIn profile data
   *
   * Main enrichment workflow:
   * 1. Generate keywords from prospect data
   * 2. Fetch Google search results
   * 3. Evaluate results with OpenAI
   * 4. Extract and validate LinkedIn URL
   * 5. Apply fallback strategies if needed
   *
   * @param prospectId - Firestore document ID
   * @param prospectData - Prospect data from Firestore
   * @param keywordConfig - Optional keyword configuration
   * @param customKeywords - Optional custom keywords (bypasses generation)
   * @returns Enrichment result object
   */
  async enrichProspect(
    prospectId: string,
    prospectData: ProspectData,
    keywordConfig?: KeywordConfig,
    customKeywords?: string
  ): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      prospectId,
      linkedinUrl: null,
      status: 'SUCCESS',
      keywords: '',
    };

    try {
      // Step 1: Generate or use custom keywords
      const keywords = customKeywords || this.generateKeywords(prospectData, keywordConfig);
      result.keywords = keywords;

      if (!keywords || keywords.trim().length === 0) {
        result.status = 'MISSING_KEYWORDS';
        result.notes = 'Could not generate search keywords from prospect data';
        return result;
      }

      // Step 2: Fetch Google search results
      let googleResults: GoogleSearchResult[];
      try {
        googleResults = await this.fetchGoogleResults(keywords, 3);
        result.googleResults = googleResults; // Store for debugging
      } catch (error) {
        result.status = 'GOOGLE_ERROR';
        result.notes = error instanceof Error ? error.message : 'Unknown Google API error';
        return result;
      }

      if (googleResults.length === 0) {
        result.status = 'NO_GOOGLE_RESULTS';
        result.notes = 'Google search returned no results';
        return result;
      }

      // Step 3: Evaluate with OpenAI
      let openaiEvaluation: OpenAIEvaluation | null = null;
      let rawResponse = '';
      try {
        const openaiResult = await this.evaluateWithOpenAI(keywords, googleResults);
        rawResponse = openaiResult.rawResponse;
        openaiEvaluation = openaiResult.evaluation;
        result.openaiResponse = rawResponse; // Store for debugging
      } catch (error) {
        result.status = 'OPENAI_ERROR';
        result.notes = error instanceof Error ? error.message : 'Unknown OpenAI error';
        return result;
      }

      // Step 4: Extract LinkedIn URL from OpenAI response
      let selectedUrl = this.extractLinkedInUrl(openaiEvaluation);
      let usedFallback = false;

      // Step 5: Apply fallback if OpenAI didn't find a URL
      if (!selectedUrl) {
        selectedUrl = this.findFirstLinkedInResult(googleResults);
        if (selectedUrl) {
          usedFallback = true;
          result.notes = 'Used fallback: first LinkedIn result from Google';
        }
      }

      // Set final result
      result.linkedinUrl = selectedUrl;
      result.status = this.determineStatus(openaiEvaluation, selectedUrl, usedFallback);

      return result;
    } catch (error) {
      // Catch any unexpected errors
      result.status = 'OPENAI_ERROR';
      result.notes = error instanceof Error ? error.message : 'Unknown error during enrichment';
      return result;
    }
  }
}
