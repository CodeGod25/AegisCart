# Contributing to AegisCart

Thank you for your interest in contributing to AegisCart! We welcome contributions from the community.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## How Can I Contribute?

### Reporting Bugs

Before submitting a bug report, please check if it has already been reported by searching the issue tracker. When you are creating a bug report, please include as much detail as possible:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Screenshots or logs if applicable
- Your environment (Node.js version, OS, etc.)

### Suggesting Features

Feature requests are welcome! Please open an issue describing:
- The problem your feature would solve
- How the feature would work
- Any potential drawbacks or considerations

### Pull Requests

We welcome pull requests! Here's how to get started:

1. Fork the repository
2. Create a new branch for your feature or bug fix (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Ensure your code follows our style guidelines
5. Add or update tests as needed
6. Run the test suite to ensure everything passes
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to your branch (`git push origin feature/amazing-feature`)
9. Open a pull request against the `main` branch

## Development Setup

### Prerequisites

- Node.js >= 20.x
- npm >= 9.x
- Git

### Getting Started

```bash
# Clone your fork
git clone https://github.com/your-username/aegiscart.git
cd aegiscart

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run the development server
npm run dev
```

### Making Changes

- TypeScript source code is in the `src/` directory
- Frontend code is in the `frontend/` directory
- Tests are in the `test/` directory
- Documentation is in the `docs/` directory

### Coding Standards

- Follow the existing code style in the repository
- Write meaningful commit messages
- Keep pull requests focused on a single concern
- Update documentation when adding or changing features
- Add tests for new functionality

## Testing

Run the test suite with:

```bash
npm test
```

This runs the node:test suite with isolated SQLite databases.

To run tests with coverage:

```bash
npm run test:coverage
```

## Documentation

If you're contributing documentation:
- Keep it clear and concise
- Use examples where helpful
- Follow the existing documentation style
- Update the table of contents in README.md if adding new docs

## License

By contributing to AegisCart, you agree that your contributions will be licensed under the MIT License.

## Questions?

If you have any questions, feel free to open an issue or reach out to the maintainers.
