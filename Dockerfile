# Use Node.js as the base
FROM node:lts-slim

# Install git for the pull script
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose the port Astro runs on
EXPOSE 4321

# Start the dev server and allow external access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
