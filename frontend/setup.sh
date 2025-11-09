#!/bin/bash

# Frontend Development Setup Script

echo "🚀 Nova Sonic Frontend Setup"
echo "=============================="
echo ""

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must be run from the frontend directory"
  exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
  fi
else
  echo "✅ Dependencies already installed"
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
  echo "📝 Creating .env.local from example..."
  cp .env.local.example .env.local
  echo "✅ Created .env.local - update NEXT_PUBLIC_WS_URL if needed"
else
  echo "✅ .env.local already exists"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "To start the development server:"
echo "  npm run dev"
echo ""
echo "To build for production:"
echo "  npm run build"
echo "  npm start"
echo ""
echo "💡 Make sure the backend is running on port 8080"
