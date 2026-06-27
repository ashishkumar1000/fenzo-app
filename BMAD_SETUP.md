# BMAD Method Setup for fenzo-app

## 🚀 Quick Start

BMAD Method v6.9.0 is installed and ready to use in your React Native/TypeScript project.

### Available Commands

```bash
# Core BMAD commands
bun run bmad          # Show BMAD main menu
bun run bmad:help     # Get guidance on what to do next

# Workflow-specific commands
bun run bmad:plan     # Planning & Requirements Analysis
bun run bmad:architect  # System Architecture & Design
bun run bmad:dev      # Development & Implementation
bun run bmad:test     # Testing & Quality Assurance
bun run bmad:deploy   # Deployment & Release
```

## 📋 When to Use BMAD

### 1. **Planning Phase** (`bun run bmad:plan`)
- Breaking down requirements
- Identifying user stories
- Creating project roadmap
- Risk assessment

### 2. **Architecture Phase** (`bun run bmad:architect`)
- System design decisions
- Component structure planning
- API/Navigation design
- Technology stack review

### 3. **Development Phase** (`bun run bmad:dev`)
- Feature implementation
- Code structure guidance
- Best practices for React Native
- Debugging assistance

### 4. **Testing Phase** (`bun run bmad:test`)
- Test strategy
- Unit test guidance
- Integration testing
- E2E testing planning

### 5. **Deployment Phase** (`bun run bmad:deploy`)
- Release planning
- Build optimization
- Deployment checklist
- Post-deployment verification

## 🎯 Project Configuration

Configuration file: `.bmadrc.json`

```json
{
  "project": {
    "name": "fenzo-app",
    "type": "react-native",
    "language": "TypeScript"
  },
  "bmad": {
    "modules": ["bmm"],
    "tools": ["claude-code"],
    "version": "6.9.0"
  },
  "workflows": {
    "planning": true,
    "architecture": true,
    "development": true,
    "testing": true,
    "deployment": true
  }
}
```

## 💡 Example Usage

### Getting Help
```bash
bun run bmad:help
# Output: "What would you like to work on next? I can help with..."
```

### Starting a Feature
```bash
bun run bmad:plan
# Describe your feature and BMAD will help you break it down
```

### Debugging a Component
```bash
bun run bmad:dev
# Ask: "How should I handle navigation state in my HomeScreen?"
```

## 📚 Project Structure for BMAD

Your fenzo-app is configured for BMAD with:
- **Type**: React Native (Expo)
- **Language**: TypeScript
- **Main Entry**: App.tsx
- **Screens**: src/screens/ (HomeScreen, DetailsScreen)
- **Navigation**: src/navigation/
- **Components**: components/

## 🔄 BMAD Workflow Loop

1. **Ask** - Ask BMAD for guidance
2. **Collaborate** - Work with AI agents (PM, Architect, Dev, QA)
3. **Implement** - Build based on structured plan
4. **Review** - Get feedback from BMAD
5. **Refine** - Iterate and improve

## 📖 Learn More

- [BMAD Documentation](https://docs.bmad-method.org)
- [Getting Started Guide](https://docs.bmad-method.org/tutorials/getting-started/)
- [GitHub Repository](https://github.com/bmad-code-org/bmad-method)
- [Discord Community](https://discord.gg/gk8jAdXWmj)

## ✨ Features

✅ Scale-adaptive planning based on project complexity  
✅ 12+ specialized domain experts available  
✅ Structured workflows for all phases  
✅ 100% free and open source  
✅ No paywalls or gated content  

---

**Remember**: Use `bun` for package management in this project!
