StockMate

StockMate is a web-based inventory management application designed for a neighborhood grocery store. It helps manage products, stock levels, sales, expiration dates, suppliers, and purchase orders.

Features

Product and category management — create, view, update, and delete products and manage product categories.

Inventory management — receive stock in batches, track remaining quantities, and record inventory movements.

Sales processing — record sales and automatically deduct quantities from inventory.

Expiration tracking — record expiration dates and identify inventory batches approaching expiration.

Expired and damaged inventory — record products transferred to returns or disposal and preserve their movement history.

Supplier management — maintain supplier details and preferred suppliers for products.

Purchase order management — create purchase orders, update order status, and record partial or full stock receipts.

Low-stock alerts — identify products below their minimum stock level and calculate recommended order quantities.

Selective purchase draft generation — select specific eligible products and generate draft purchase orders grouped by supplier.

Inventory dashboard — summarize products, low-stock alerts, upcoming expiration dates, and open purchase orders.

Inventory history — review recorded movements for individual products.

Technology Stack

Frontend: React and JavaScript

Styling: CSS

Build tool: Vite

Backend: Node.js and Express

Database: SQLite using better-sqlite3

Testing: Node.js built-in test runner and Supertest

Linting: ESLint

Version control: Git and GitHub

Containerization: Docker

CI/CD: GitHub Actions

Prerequisites

For local development, install:

Node.js 24 or a compatible Node.js 24 release

npm

Git

Docker is optional for local development and is required only if you want to build or run the container image.

Getting Started

1. Clone the repository

git clone https://github.com/hanasolomon86-jpg/stockmate.git
cd stockmate

2. Install dependencies

Install backend dependencies:

npm ci --prefix backend

Install frontend dependencies:

npm ci --prefix frontend

3. Start the backend

In a terminal at the project root, run:

npm --prefix backend start

The API runs at:

http://localhost:3000

The SQLite database is initialized automatically by the backend. By default, the database file is stored at backend/data/stockmate.db.

The application writes runtime logs to backend/logs/app.log by default.

4. Start the frontend

Open a second terminal at the project root and run:

npm --prefix frontend run dev

Vite displays the local development URL, normally:

http://localhost:5173

Open that URL in your browser. During development, Vite proxies /api requests to the backend at http://localhost:3000.

5. Verify the backend

Check the health endpoint:

curl http://localhost:3000/api/health

A successful response indicates that the API is running.

Testing and Quality Checks

Backend tests

Run the automated backend tests from the project root:

npm --prefix backend test

The standard test command runs the test files under backend/tests, including API integration tests and unit tests for date validation.

Backend code coverage

Generate a coverage report using Node.js:

cd backend
node --experimental-test-coverage --test tests/*.test.js

The report includes line, branch, and function coverage for the backend files exercised by the test suite. It does not measure React frontend coverage.

Return to the project root after running this command:

cd ..

Frontend lint

Run ESLint:

npm --prefix frontend run lint

Frontend production build

Build the frontend for production:

npm --prefix frontend run build

The generated production files are written to frontend/dist.

Docker

The repository includes a multi-stage Dockerfile that builds the React frontend and packages it with the backend.

Build the image locally

From the project root:

docker build -t stockmate .

Run the container

docker run --rm --name stockmate -p 3000:3000 -v stockmate-data:/app/backend/data -v stockmate-logs:/app/backend/logs stockmate

The application is available at:

http://localhost:3000

The named volumes preserve the SQLite database and runtime logs when the container is removed.

The repository also includes a .dockerignore file to exclude unnecessary local files from the Docker build context.

CI/CD

GitHub Actions runs the automated backend tests, frontend lint, and production build for pull requests targeting main and for relevant pushes.

The Docker workflow builds and publishes the container image to Docker Hub after successful checks on push events.

The workflow configuration is located at .github/workflows/ci.yml.

Project Structure

stockmate/
├── backend/
│   ├── app.js
│   ├── database.js
│   ├── index.js
│   ├── logger.js
│   ├── tests/
│   └── utils/
├── frontend/
│   ├── src/
│   │   └── components/
│   └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── Dockerfile
├── .dockerignore
├── ALL_LICENSES
└── README.md

Security and Logging

The backend validates incoming data, uses parameterized SQL statements for database operations, and applies database constraints to protect data integrity.

The application records request method, path, status code, and duration, along with relevant application events. The standard request logger does not record request bodies or headers.

Runtime database files and logs should remain local or in persistent runtime storage rather than being committed to source control.

Dependencies and Third-Party Licenses

Backend and frontend dependencies are managed separately using npm. Their package-lock.json files support reproducible dependency installation.

The ALL_LICENSES file provides an inventory of third-party dependency licenses.

Project Management

Development is organized using Git branches, commits, pull requests, and user stories tracked on GitHub Projects.

The development board is available here:

StockMate — Development Board