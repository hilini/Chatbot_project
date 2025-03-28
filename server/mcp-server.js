/**
 * MCP Server for Cancer Treatment Planning
 * 
 * This server exposes tools and resources for cancer treatment planning
 * based on Korean healthcare guidelines.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

// Initialize the MCP Server
const server = new Server({
  name: "anticancer-treatment",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  }
});

// Define knowledge base path - this would contain your cancer treatment data
const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'data');

/**
 * Tool: Get Treatment Regimen
 * 
 * Retrieves recommended treatment regimens for a specified cancer type and stage
 */
server.tool(
  "getTreatmentRegimen",
  "Get recommended treatment regimens for a specific cancer type and stage",
  {
    cancerType: z.string().describe("Type of cancer (e.g., 'lung', 'breast', 'colorectal')"),
    stage: z.string().describe("Cancer stage (e.g., 'I', 'II', 'III', 'IV')"),
    biomarkers: z.array(z.string()).optional().describe("Relevant biomarkers (e.g., ['EGFR+', 'HER2-'])")
  },
  async ({ cancerType, stage, biomarkers = [] }) => {
    try {
      // This is a simplified implementation
      // In a real application, you would query a database or analyze your RAG data
      
      console.log(`Searching for treatment regimens for ${cancerType} cancer stage ${stage} with biomarkers: ${biomarkers.join(", ")}`);
      
      // Simulated response based on your RAG system
      const recommendedRegimens = await simulateTreatmentQuery(cancerType, stage, biomarkers);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(recommendedRegimens, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error in getTreatmentRegimen:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error retrieving treatment regimens: ${error.message}`
          }
        ]
      };
    }
  }
);

/**
 * Tool: Check Treatment Coverage
 * 
 * Checks if a specific treatment is covered by Korean health insurance
 */
server.tool(
  "checkTreatmentCoverage",
  "Check if a treatment is covered by Korean health insurance",
  {
    treatmentName: z.string().describe("Name of treatment or medication"),
    cancerType: z.string().describe("Type of cancer"),
    patientDetails: z.object({
      age: z.number().optional(),
      previousTreatments: z.array(z.string()).optional()
    }).optional().describe("Relevant patient details")
  },
  async ({ treatmentName, cancerType, patientDetails = {} }) => {
    try {
      console.log(`Checking coverage for ${treatmentName} for ${cancerType} cancer`);
      
      // Simulated response based on your RAG system
      const coverageInfo = await simulateCoverageQuery(treatmentName, cancerType, patientDetails);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(coverageInfo, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error in checkTreatmentCoverage:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error checking treatment coverage: ${error.message}`
          }
        ]
      };
    }
  }
);

/**
 * Tool: Find Clinical Trials
 * 
 * Searches for relevant clinical trials for a cancer condition
 */
server.tool(
  "findClinicalTrials",
  "Find relevant clinical trials for a specific cancer condition",
  {
    cancerType: z.string().describe("Type of cancer"),
    location: z.string().optional().describe("Location (city or region in Korea)"),
    patientDetails: z.object({
      age: z.number().optional(),
      biomarkers: z.array(z.string()).optional()
    }).optional().describe("Relevant patient details")
  },
  async ({ cancerType, location = "Seoul", patientDetails = {} }) => {
    try {
      console.log(`Searching for clinical trials for ${cancerType} cancer in ${location}`);
      
      // Simulated response based on your RAG system
      const trials = await simulateClinicalTrialsQuery(cancerType, location, patientDetails);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(trials, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error("Error in findClinicalTrials:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error finding clinical trials: ${error.message}`
          }
        ]
      };
    }
  }
);

// Define a sample prompt for treatment recommendations
server.setPromptListHandler(async () => {
  return {
    prompts: [
      {
        name: "treatment-recommendation",
        description: "Get personalized treatment recommendations based on patient details",
        arguments: [
          {
            name: "cancerType",
            description: "Type of cancer",
            required: true
          },
          {
            name: "stage",
            description: "Cancer stage",
            required: true
          },
          {
            name: "patientAge",
            description: "Patient's age",
            required: true
          },
          {
            name: "biomarkers",
            description: "Relevant biomarkers (comma-separated)",
            required: false
          }
        ]
      }
    ]
  };
});

// Implement the prompt handler
server.setPromptGetHandler(async (request) => {
  if (request.name === "treatment-recommendation") {
    const { cancerType, stage, patientAge, biomarkers = "" } = request.arguments || {};
    
    const biomarkerArray = biomarkers.split(",").map(b => b.trim()).filter(Boolean);
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please provide treatment recommendations for a ${patientAge}-year-old patient with ${stage} ${cancerType} cancer${biomarkerArray.length ? ` with the following biomarkers: ${biomarkerArray.join(", ")}` : ""}.

Please include:
1. Standard first-line treatment options
2. Alternative approaches if first-line treatments fail
3. Relevant clinical trial considerations
4. Insurance coverage information in Korea`
          }
        }
      ]
    };
  }
  
  throw new Error(`Prompt not found: ${request.name}`);
});

// Simulation functions (these would connect to your actual database or RAG system in production)
async function simulateTreatmentQuery(cancerType, stage, biomarkers) {
  // In a real implementation, this would query your database or RAG system
  return {
    recommendedRegimens: [
      {
        name: "Standard chemotherapy regimen",
        description: "Standard first-line treatment",
        medications: ["Drug A", "Drug B"],
        coverageStatus: "Fully covered",
        evidenceLevel: "Level 1"
      },
      {
        name: "Targeted therapy approach",
        description: "For patients with specific biomarkers",
        medications: ["Targeted Drug X"],
        coverageStatus: "Partially covered",
        evidenceLevel: "Level 2"
      }
    ],
    notes: "Treatment should be tailored based on patient's overall health status."
  };
}

async function simulateCoverageQuery(treatmentName, cancerType, patientDetails) {
  // In a real implementation, this would query your database or RAG system
  return {
    treatmentName,
    coverageStatus: "Partially covered",
    conditions: [
      "Patient must have failed first-line therapy",
      "Requires specific biomarker confirmation"
    ],
    estimatedCosts: {
      insuredAmount: "70%",
      patientResponsibility: "30%"
    },
    relevantRegulations: [
      "Korean Health Insurance Review & Assessment Service Guideline 2023-142"
    ]
  };
}

async function simulateClinicalTrialsQuery(cancerType, location, patientDetails) {
  // In a real implementation, this would query your database or RAG system
  return {
    availableTrials: [
      {
        id: "KCT0012345",
        title: `Novel combination therapy for advanced ${cancerType} cancer`,
        phase: "Phase 2",
        location: "Seoul National University Hospital",
        contactInformation: "research@snuh.org",
        eligibilityCriteria: [
          "Age 18-75",
          `Confirmed ${cancerType} cancer diagnosis`,
          "ECOG performance status 0-1"
        ]
      },
      {
        id: "KCT0023456",
        title: `Immunotherapy evaluation in ${cancerType} cancer`,
        phase: "Phase 3",
        location: "Yonsei Severance Hospital",
        contactInformation: "trials@yonsei.ac.kr",
        eligibilityCriteria: [
          "Age 20-80",
          `Stage III-IV ${cancerType} cancer`,
          "No prior immunotherapy"
        ]
      }
    ],
    notes: "Patient eligibility must be confirmed by trial coordinators."
  };
}

// Start the server
async function main() {
  try {
    // Create a stdio transport for communication
    const transport = new StdioServerTransport();
    
    // Connect the server to the transport
    await server.connect(transport);
    
    console.log("MCP Anticancer Treatment Server running");
  } catch (error) {
    console.error("Error starting MCP server:", error);
    process.exit(1);
  }
}

main();

// Export the server for possible use in other modules
module.exports = {
  server
}; 