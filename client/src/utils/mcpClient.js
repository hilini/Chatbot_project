/**
 * MCP Client utility for the anticancer chat application
 * 
 * This module provides a simplified browser-compatible version of the MCP client
 * that communicates with the MCP server via REST API instead of using the Node.js SDK directly.
 */

class McpClientManager {
  constructor() {
    this.tools = [];
    this.prompts = [];
    this.isConnected = false;
    this.connectionError = null;
    this.serverUrl = 'http://10.10.10.103:3001'; // Use the server URL from the config
  }

  /**
   * Initialize and connect to the MCP server
   */
  async initialize() {
    try {
      // In browser environment, we'll check server health instead of using the MCP SDK directly
      const response = await fetch(`${this.serverUrl}/api/health`);
      if (!response.ok) {
        throw new Error(`Server health check failed: ${response.status}`);
      }
      
      const health = await response.json();
      
      // Check if MCP is enabled on the server
      if (!health.mcpEnabled) {
        throw new Error('MCP is not enabled on the server');
      }
      
      this.isConnected = true;
      console.log('Successfully connected to server with MCP enabled');

      // For demonstration purposes, we'll define the available tools manually
      // In a real app, these would come from the server
      this.tools = [
        {
          name: "getTreatmentRegimen",
          description: "Get recommended treatment regimens for a specific cancer type, stage, and biomarkers"
        },
        {
          name: "checkTreatmentCoverage",
          description: "Check if a specific treatment is covered by Korean National Health Insurance for a given cancer type"
        },
        {
          name: "findClinicalTrials",
          description: "Find clinical trials available for a specific cancer type and location"
        }
      ];

      console.log('Available MCP tools:', this.tools.map(t => t.name).join(', '));

      return {
        connected: true,
        tools: this.tools,
        prompts: this.prompts
      };
    } catch (error) {
      this.connectionError = error.message;
      this.isConnected = false;
      console.error("Failed to connect to MCP server:", error);
      
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Get recommended treatment regimens
   */
  async getTreatmentRegimen(cancerType, stage, biomarkers = []) {
    if (!this.isConnected) {
      throw new Error("MCP client is not connected");
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/mcp/tools/getTreatmentRegimen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancerType,
          stage,
          biomarkers
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error getting treatment regimen:", error);
      throw error;
    }
  }

  /**
   * Check treatment coverage
   */
  async checkTreatmentCoverage(treatmentName, cancerType, patientDetails = {}) {
    if (!this.isConnected) {
      throw new Error("MCP client is not connected");
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/mcp/tools/checkTreatmentCoverage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          treatmentName,
          cancerType,
          patientDetails
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error checking treatment coverage:", error);
      throw error;
    }
  }

  /**
   * Find clinical trials
   */
  async findClinicalTrials(cancerType, location, patientDetails = {}) {
    if (!this.isConnected) {
      throw new Error("MCP client is not connected");
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/mcp/tools/findClinicalTrials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancerType,
          location,
          patientDetails
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error finding clinical trials:", error);
      throw error;
    }
  }

  /**
   * Get a prompt for treatment recommendations
   */
  async getTreatmentRecommendationPrompt(cancerType, stage, patientAge, biomarkers = "") {
    if (!this.isConnected) {
      throw new Error("MCP client is not connected");
    }

    try {
      const result = await this.client.getPrompt({
        name: "treatment-recommendation",
        arguments: {
          cancerType,
          stage,
          patientAge,
          biomarkers
        }
      });

      return result.messages[0].content.text;
    } catch (error) {
      console.error("Error getting treatment recommendation prompt:", error);
      throw error;
    }
  }

  /**
   * Analyze patient medical record
   */
  async analyzePatientRecord(patientRecord) {
    if (!this.isConnected) {
      throw new Error("MCP client is not connected");
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/mcp/tools/analyzePatientRecord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientRecord
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error analyzing patient record:", error);
      throw error;
    }
  }

  /**
   * Close the MCP client connection
   */
  async close() {
    // Nothing to do for HTTP-based connections
    this.isConnected = false;
  }
}

// Create a singleton instance
const mcpClient = new McpClientManager();

export default mcpClient; 