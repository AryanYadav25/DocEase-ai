# DocuEase AI — AI Document Simplifier

**Turn complex documents into clear explanations, useful summaries, and study materials.**

DocuEase AI is an AI-powered document understanding application designed to help students and other users understand complicated documents without having to read every page manually.

It supports PDFs, scanned documents, images, Word documents, and text files. The application extracts text, processes the document, and uses AI to generate simplified explanations, summaries, answers to questions, and revision materials.

Unlike a basic summarization tool, DocuEase AI also helps users find relevant information within their documents and connect AI-generated answers to the pages where the information appears.

## Why DocuEase AI?

Documents often contain complex terminology, lengthy paragraphs, and information that is difficult to understand quickly. Students may need to read the same material multiple times to understand it or prepare for examinations.

DocuEase AI aims to make this process easier by allowing users to:

- Understand complicated content in simpler language.
- Find important information without reading an entire document.
- Ask questions about uploaded documents.
- Generate summaries, flashcards, quizzes, and revision notes.
- Locate the original page associated with relevant information.

## Key Features

### 1. Document Upload and Processing
- Upload PDFs, scanned PDFs, images, Word documents, and text files.
- Process multiple files with upload progress and validation.
- Extract text from supported document formats.
- Use Optical Character Recognition (OCR) for scanned pages and images.

### 2. AI-Powered Document Simplification
- Convert complex content into easy-to-understand explanations.
- Identify key points, important facts, dates, names, and technical terms.
- Adjust explanation level and summary length.
- Highlight action items and unclear or missing information.

### 3. Intelligent Summarization
Generate different types of summaries, including:
- Paragraph summaries
- Bullet-point summaries
- Section-by-section summaries
- Executive summaries
- Key takeaways and important quotations

Long documents can be processed in smaller sections before the results are combined.

### 4. Chat with Your Documents
Ask questions about an uploaded document and receive answers based on relevant document content.

The system retrieves relevant sections, provides page references where available, and supports follow-up questions. When the information cannot be found, it can indicate that rather than presenting an unsupported answer as a fact.

### 5. Study and Learning Tools
- Generate flashcards.
- Create multiple-choice and short-answer quizzes.
- Prepare revision notes.
- Explain selected text.
- Define technical vocabulary.
- Translate supported content into configured languages.

### 6. Document Library
Manage documents from a central workspace with search, sorting, tags, favourites, renaming, and other document-management features.

Users can also export supported results and manage their account settings.

## How Does It Work?

DocuEase AI follows a document-processing pipeline that converts an uploaded file into information the AI can use.

### Step 1: Upload a Document

The user uploads a supported file through the React frontend. The backend validates the file type, content, size, and other configured limits before accepting it.

### Step 2: Extract the Text

The application selects an extraction method based on the document:

- **Text-based PDFs:** Extract text from the existing PDF text layer.
- **Scanned PDFs and images:** Use OCR to recognize text from page images.
- **Word documents:** Extract text from DOCX files.
- **Text files:** Read the supported text content directly.

Image preprocessing can improve OCR results. OCR quality may vary, especially with handwriting or poor-quality scans.

### Step 3: Organize the Content

The extracted content is organized into pages and overlapping text chunks. The application retains page information so that relevant passages can be located later.

The processed document and associated data are stored for use by the application's document workspace and AI features.

### Step 4: Retrieve Relevant Information

When a user asks a question, DocuEase AI searches the document's text chunks using a BM25-based retrieval approach. It selects the passages most relevant to the question rather than sending the entire document for every chat request.

### Step 5: Generate an AI Response

The selected text is passed to the configured AI model with instructions to perform the requested task, such as simplifying a passage, summarizing a document, or answering a question.

The application supports multiple AI provider configurations through a shared adapter, including Groq, Google Gemini, OpenRouter, Mistral, Cerebras, GitHub Models, Ollama, and compatible custom endpoints.

### Step 6: Display the Result

The frontend displays the generated explanation, summary, answer, or study material. Where supported, answers include page citations that can help the user return to the relevant part of the original document.

**Important:** AI-generated content and OCR results can contain errors. Users should verify important information against the original document.

## System Architecture

DocuEase AI uses a frontend, backend API, database, document-processing services, and an AI integration layer.

```text
                 USER
                   |
                   v
        React + Vite Frontend
                   |
                   v
        Express + TypeScript API
                   |
          +--------+--------+
          |        |        |
          v        v        v
       MongoDB  Document   Authentication
                 Services    & Security
                   |
          +--------+--------+
          |                 |
          v                 v
    Text Extraction       OCR
    PDF / DOCX / TXT   Tesseract.js
          |                 |
          +--------+--------+
                   |
                   v
          Pages and Text Chunks
                   |
                   v
         Relevant Text Retrieval
              (BM25)
                   |
                   v
            AI Provider Adapter
                   |
                   v
       Simplification, Answers,
       Summaries and Study Tools
                   |
                   v
          Results in the UI
```

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB with Mongoose |
| PDF processing | pdf.js |
| Word document processing | mammoth |
| OCR | Tesseract.js |
| Image processing | sharp |
| Validation | Zod |
| Authentication | Argon2id, JWT in HTTP-only cookies |
| AI integration | Shared OpenAI-compatible adapter with provider presets |
| Testing | Vitest, Supertest, Testing Library |

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- MongoDB Atlas or a local MongoDB server
- An API key from a supported AI provider, or Ollama for local model inference

### 1. Clone the Repository

```bash
git clone https://github.com/AryanYadav25/DocEase-ai.git
cd DocEase-ai
```

### 2. Install Dependencies

```bash
npm run install:all
```

### 3. Configure Environment Variables

Create a `.env` file from the provided example:

```bash
cp .env.example .env
```

On Windows, you can also copy `.env.example` to `.env` using File Explorer.

Configure the required values in `.env`:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
AI_PROVIDER=groq
AI_API_KEY=your_ai_provider_api_key
```

Use the actual variable names and configuration options documented in `.env.example`. Never commit your real `.env` file, API keys, database credentials, or production secrets to GitHub.

### 4. Set Up OCR

Run the OCR setup command from the server directory:

```bash
cd server
npm run setup:ocr
cd ..
```

This downloads the configured OCR language data needed for text recognition.

### 5. Start the Application

Open two terminals in the project root.

**Terminal 1 — Backend**

```bash
cd server
npm run dev
```

The API runs at `http://localhost:4000`.

**Terminal 2 — Frontend**

```bash
cd client
npm run dev
```

Open `http://localhost:5173` in your browser, create an account, and upload a sample document.

## API Documentation

The backend exposes a versioned REST API under:

```text
/api/v1
```

For endpoint details, request formats, response structures, and examples, see [API Documentation](docs/API.md).

## Security and Privacy

DocuEase AI includes security measures such as password hashing, HTTP-only session cookies, request validation, rate limiting, CORS configuration, file-content validation, and document ownership checks.

Uploaded files are stored in private server-side storage rather than a public static directory.

Keep in mind that documents processed by an external AI provider may be sent to that provider for inference. Review the provider's privacy policies and avoid uploading sensitive documents unless the data-handling arrangements are appropriate.

## Project Goals

DocuEase AI was developed as a college project to explore how modern web technologies, OCR, information retrieval, and large language models can work together to make document understanding easier.

The project brings together full-stack development, document processing, AI integration, data management, and user-focused learning tools in one application.

## Future Improvements

Potential areas for future development include:
- Better OCR for low-quality scans and handwriting.
- More advanced retrieval and citation evaluation.
- Additional language support.
- Performance improvements for large documents.
- More evaluation tests for answer accuracy and reliability.

## License

Add your chosen open-source license here before distributing the project under a specific license.
