require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

// Configure middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Configure CORS to accept requests from all your sites
app.use(cors({
  origin: [
    'https://robert-clark-4dee.mykajabi.com', 
    'http://localhost:5000', 
    'https://cli-backend-g0lg.onrender.com',
    'https://advisory.valoraanalytics.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add a fallback CORS handler for any missed routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Serve static files from the "public" folder (for serving prompts)
app.use(express.static("public"));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Endpoint to serve the CLI calculation prompt
app.get("/PromptCalcCLI.txt", (req, res) => {
  // If the file exists, serve it, otherwise send the default prompt
  const promptPath = path.join(__dirname, "public", "PromptCalcCLI.txt");
  
  if (fs.existsSync(promptPath)) {
    res.sendFile(promptPath);
  } else {
    // Provide a default CLI calculation prompt
    res.type("text").send(getDefaultPrompt());
  }
});

// Function to get default prompt
function getDefaultPrompt() {
  return `Career Level Index (CLI) Calculation Framework
Purpose
The Career Level Index (CLI) is a scoring system that evaluates the career achievements of artists. It measures an artist's professional development and standing within the art world using seven key categories, resulting in a normalized score ranging from 1.00 to 5.00. A score of 1.00 indicates no measurable achievements, while a 5.00 reflects the maximum possible accomplishments.
________________________________________
How CLI is Calculated
1.	Categories and Weights The CLI evaluates achievements across the following seven categories, each weighted by its importance to an artist's career:
o	Education: 10%
o	Exhibitions: 25%
o	Awards & Competitions: 15%
o	Commissions: 10%
o	Collections: 15%
o	Publications: 15%
o	Institutional Interest: 10%
2.	Scoring System Each category is assigned a score using a three-tiered system:
o	High-Profile Achievement: 1.0 (e.g., solo exhibitions, national awards, museum collections, features in renowned publications).
o	Low-Profile Achievement: 0.6 (e.g., group exhibitions, local awards, private collections, features in lesser-known publications).
o	No Mention: 0.0 (e.g., the category is not addressed in the biography).
3.	Weighted Contributions
o	The score for each category is multiplied by its respective weight to calculate its contribution to the overall CLI.
o	Example: If an artist has a high-profile solo exhibition, the contribution from this category is: 1.0×0.25=0.25
4.	Normalization
o	The raw score (sum of all weighted contributions) is converted into the CLI score using the formula: CLI=(RawScore×4.0)+1.00
o	This ensures that scores range between 1.00 and 5.00.
________________________________________
Rules and Safeguards
1.	Structured Breakdown Each category is scored with the following structure:
o	What was provided: Description of achievements (e.g., "Exhibited in Paris and London").
o	Why the score was assigned: Explanation of the assigned score (e.g., "High-profile exhibitions = 1.0").
o	Final score contribution: Weighted contribution to the overall CLI (e.g., 1.0×0.25=0.25).
2.	Extrapolation
o	When details are unclear, reasonable assumptions are allowed: 
	Sales are treated as private collections unless explicitly stated otherwise.
	Ambiguous mentions like "featured work" are credited as publications.
3.	Validation Checks
o	Prevent over-crediting by ensuring: 
	If exhibitions are scored as high-profile (1.0), no additional weight is applied.
	Publication scores are capped at 1.0 per artist, even if multiple high-profile mentions exist.

Output Format:
1. Calculate the Career Level Index (CLI) value based on the artist's resume.
2. Return the following in your response:
   - The CLI value: "Career Level Index (CLI) = n.nn" with n.nn being the value rounded to two decimal places
   - Two or three sentences that explain the artist's career level based on the CLI value
   - A breakdown of each category showing the score and contribution to the CLI

DO NOT include any additional analysis or commentary beyond what is requested.`;
}

app.post("/analyze", async (req, res) => {
  try {
    console.log("Received analyze request");
    const { prompt, artistName, artistResume } = req.body;

    if (!prompt) {
      console.log("Missing prompt in request");
      return res.status(400).json({ error: { message: "Prompt is required" } });
    }
    
    if (!artistResume) {
      console.log("Missing artist resume in request");
      return res.status(400).json({ error: { message: "Artist resume is required" } });
    }

    if (!OPENAI_API_KEY) {
      console.log("Missing OpenAI API key");
      return res.status(500).json({ error: { message: "Server configuration error: Missing API key" } });
    }

    // Log info about the request
    console.log(`Processing request for artist: "${artistName}"`);
    console.log(`Prompt length: ${prompt.length} characters`);
    console.log(`Resume length: ${artistResume.length} characters`);
    
    // Construct the prompt with artist name and resume
    const finalPrompt = `Artist: "${artistName}"

Artist Resume/Bio:
${artistResume}

${prompt}`;

    console.log("Sending request to OpenAI API");
    
    // Send request to OpenAI API
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-turbo",
        messages: [
          { 
            role: "system", 
            content: "You are an expert art career analyst specializing in evaluating artists' professional achievements. Your task is to analyze the provided artist's resume and calculate an accurate CLI (Career Level Index) value between 1.00 and 5.00 based on the specified calculation framework. Provide the CLI value, a brief explanation, and a detailed category breakdown." 
          },
          { 
            role: "user", 
            content: finalPrompt
          }
        ],
        max_tokens: 1000
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    console.log("Received response from OpenAI API");
    
    if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.log("Invalid response format from OpenAI:", JSON.stringify(response.data));
      return res.status(500).json({ error: { message: "Invalid response from OpenAI API" } });
    }

    let analysisText = response.data.choices[0].message.content;
    console.log("Analysis text:", analysisText);

    // Extract the CLI value using regex
    const cliRegex = /Career\s+Level\s+Index\s*\(?CLI\)?\s*=\s*(\d+\.\d+)/i;
    const cliMatch = analysisText.match(cliRegex);
    let cliValue = "3.00"; // Default value if extraction fails
    
    if (cliMatch && cliMatch[1]) {
      cliValue = cliMatch[1];
      // Ensure it's formatted to 2 decimal places
      if (cliValue.split('.')[1].length === 1) {
        cliValue = `${cliValue}0`;
      }
      console.log("Extracted CLI value:", cliValue);
    } else {
      console.log("Could not extract CLI value from response");
    }
    
    // Extract the explanation text (everything after the CLI value statement)
    const explanationRegex = /Career\s+Level\s+Index\s*\(?CLI\)?\s*=\s*\d+\.\d+\s*(.+?)(?:\n\n|\n$|$)/i;
    const explanationMatch = analysisText.match(explanationRegex);
    let explanation = "";
    
    if (explanationMatch && explanationMatch[1]) {
      explanation = explanationMatch[1].trim();
      console.log("Extracted explanation:", explanation);
    } else {
      console.log("Could not extract explanation from response");
    }

    // Extract category breakdown
    let categoryBreakdown = "";
    const categoryMatch = analysisText.match(/Category Breakdown[\s\S]*?(?=\n\nRaw Score:|$)/i);
    if (categoryMatch && categoryMatch[0]) {
      // Process the category breakdown to HTML format
      const categoryText = categoryMatch[0].replace(/Category Breakdown[:\s]*/i, '').trim();
      
      // Split by numbered categories and convert to HTML
      const categoryItems = categoryText.split(/\d+\.\s+/).filter(item => item.trim() !== '');
      
      if (categoryItems.length > 0) {
        categoryBreakdown = categoryItems.map(item => {
          const lines = item.split('\n').map(line => line.trim()).filter(line => line !== '');
          if (lines.length > 0) {
            const categoryName = lines[0].replace(/:$/, '');
            const details = lines.slice(1).join('<br>');
            return `<div class="category">
              <span class="category-title">${categoryName}:</span>
              <div class="category-details">${details}</div>
            </div>`;
          }
          return '';
        }).join('');
      }
    }

    const finalResponse = {
      analysis: analysisText,
      cli: cliValue,
      explanation: explanation,
      categoryBreakdown: categoryBreakdown
    };

    console.log("Sending final response to client");
    // Send the response
    res.json(finalResponse);

  } catch (error) {
    console.error("Error in /analyze endpoint:", error);
    
    // Detailed error logging
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
      console.error("Response data:", JSON.stringify(error.response.data));
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }
    
    const errorMessage = error.response?.data?.error?.message || 
                         error.message || 
                         "An unknown error occurred";
                         
    res.status(500).json({ 
      error: { 
        message: errorMessage,
        details: error.toString()
      } 
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));