# Google Apps Script Code for Two-File Google Drive Integration

This is the Google Apps Script code that will handle saving and loading data to/from Google Drive using separate files for tenders and transactions.

## Code.gs

```javascript
// Google Apps Script code for Tender Management Google Drive Integration (Two-File Approach)

// File names for storing data in Google Drive
const TENDERS_FILENAME = "tenders_v1.json";
const TXNS_FILENAME = "transactions_v1.json";

// Function to get or create a file in Google Drive
function getOrCreateFile(filename) {
  // Search for existing file
  const files = DriveApp.getFilesByName(filename);
  
  if (files.hasNext()) {
    // File exists, return it
    return files.next();
  } else {
    // File doesn't exist, create it
    const file = DriveApp.createFile(filename, "[]", "application/json");
    return file;
  }
}

// Function to save tenders to Google Drive
function saveTenders(tenders) {
  try {
    const file = getOrCreateFile(TENDERS_FILENAME);
    file.setContent(JSON.stringify(tenders, null, 2));
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

// Function to save transactions to Google Drive
function saveTransactions(transactions) {
  try {
    const file = getOrCreateFile(TXNS_FILENAME);
    file.setContent(JSON.stringify(transactions, null, 2));
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

// Function to load tenders from Google Drive
function loadTenders() {
  try {
    const file = getOrCreateFile(TENDERS_FILENAME);
    const content = file.getBlob().getDataAsString();
    return { status: "success", data: JSON.parse(content || "[]") };
  } catch (error) {
    return { status: "error", message: error.toString(), data: [] };
  }
}

// Function to load transactions from Google Drive
function loadTransactions() {
  try {
    const file = getOrCreateFile(TXNS_FILENAME);
    const content = file.getBlob().getDataAsString();
    return { status: "success", data: JSON.parse(content || "[]") };
  } catch (error) {
    return { status: "error", message: error.toString(), data: [] };
  }
}

// Web app entry point for saving data
function doPost(e) {
  const params = e.parameter;
  
  // Set CORS headers
  const output = ContentService.createTextOutput();
  output.setHeaders({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  });
  
  try {
    if (params.action === "saveTenders") {
      const tenders = JSON.parse(params.data);
      const result = saveTenders(tenders);
      output.setContent(JSON.stringify(result));
    } else if (params.action === "saveTransactions") {
      const transactions = JSON.parse(params.data);
      const result = saveTransactions(transactions);
      output.setContent(JSON.stringify(result));
    } else {
      output.setContent(JSON.stringify({ status: "error", message: "Invalid action" }));
    }
  } catch (error) {
    output.setContent(JSON.stringify({ status: "error", message: error.toString() }));
  }
  
  return output;
}

// Web app entry point for loading data
function doGet(e) {
  const params = e.parameter;
  
  // Set CORS headers
  const output = ContentService.createTextOutput();
  output.setHeaders({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  });
  
  try {
    if (params.action === "loadTenders") {
      const result = loadTenders();
      output.setContent(JSON.stringify(result));
    } else if (params.action === "loadTransactions") {
      const result = loadTransactions();
      output.setContent(JSON.stringify(result));
    } else if (params.action === "loadAll") {
      const tendersResult = loadTenders();
      const transactionsResult = loadTransactions();
      output.setContent(JSON.stringify({
        status: (tendersResult.status === "success" && transactionsResult.status === "success") ? "success" : "error",
        tenders: tendersResult.data,
        transactions: transactionsResult.data
      }));
    } else {
      output.setContent(JSON.stringify({ status: "error", message: "Invalid action" }));
    }
  } catch (error) {
    output.setContent(JSON.stringify({ status: "error", message: error.toString() }));
  }
  
  return output;
}
```

## Deployment Instructions

1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Replace the default code with the code above
4. Save the project
5. Click "Deploy" > "New deployment"
6. Select "Web app" as the deployment type
7. Configure the settings:
   - "Execute as": Me
   - "Who has access": Anyone (or adjust as needed for your security requirements)
8. Click "Deploy"
9. Copy the Web App URL - this will be used in the JavaScript code

## Usage

The web app exposes the following endpoints:

- `GET` with `action=loadTenders` - Load tenders from Google Drive
- `GET` with `action=loadTransactions` - Load transactions from Google Drive
- `GET` with `action=loadAll` - Load both tenders and transactions
- `POST` with `action=saveTenders` - Save tenders to Google Drive
- `POST` with `action=saveTransactions` - Save transactions to Google Drive

All endpoints return JSON data with a `status` field indicating whether the operation was successful ("success" or "error") and a `message` field with error details when applicable.