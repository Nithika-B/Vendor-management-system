# Vendor Management System

A web-based vendor management application built with the MERN stack.

## Features

- Manage vendor information
- View and organize vendor records
- React-based frontend
- Express and Node.js backend
- MongoDB database integration

## Tech Stack

- **Frontend:** React, Vite
- **Backend:** Node.js, Express
- **Database:** MongoDB
- **Other:** Mongoose, CORS, dotenv

## Prerequisites

- Node.js and npm
- MongoDB database and connection URI

## Setup

1. Clone or download this repository.
2. From the project root, install the dependencies:

   `npm run setup`

3. Create a `.env` file in the project root and add your MongoDB connection string:

   `MONGODB_URI=your_mongodb_connection_uri`

4. Start the frontend and backend:

   `npm run dev`

## Available Scripts

- `npm run setup` — Install root and client dependencies.
- `npm start` — Start the backend server.
- `npm run dev` — Start the backend and frontend in development mode.

## Project Structure

- `index.js` — Backend entry point
- `client/` — React frontend
- `.env` — Environment variables

## Note

Keep your `.env` file private. Do not commit database credentials or other secrets to version control.