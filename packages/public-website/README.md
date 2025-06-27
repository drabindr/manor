# Manor Public Website

This package contains the public-facing website for Manor that will be served at `mymanor.click`. This is a marketing/landing page website that doesn't require authentication and is accessible to everyone.

## Development

```bash
# Start development server
npm run dev:public

# Build for production  
npm run build

# Preview production build
npm run preview
```

## Deployment

The public website is automatically deployed to AWS CloudFront and served at:
- **Production**: https://mymanor.click

### Manual Deployment

```bash
# Deploy to production
npm run deploy:public-website
```

### Automated Deployment

The website is automatically deployed when changes are pushed to the `main` branch via GitHub Actions.

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS with Typography plugin
- **Icons**: Lucide React
- **Build Output**: Static files in `dist/` directory
- **Hosting**: AWS S3 + CloudFront
- **Domain**: Route 53 managed domain
- **SSL**: AWS Certificate Manager

## Infrastructure

The deployment creates:
- S3 bucket for static website hosting
- CloudFront distribution with custom cache policies
- SSL certificate for mymanor.click and www.mymanor.click
- Route 53 A records for both domains
- Security headers and optimized caching

## Content

This website serves as the public face of the Manor product, containing:
- Product information and features
- Marketing content
- Landing pages
- Contact information
- No authentication or user-specific content

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run deploy` - Deploy to AWS (via CDK stack)
