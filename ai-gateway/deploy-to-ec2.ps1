# AI Gateway EC2 Deployment Script
# This automates the entire deployment process

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2_IP,
    
    [Parameter(Mandatory=$false)]
    [string]$KeyPath = "C:\Users\pavan\Downloads\memento-ai-gateway.pem",
    
    [Parameter(Mandatory=$false)]
    [string]$EC2_User = "ec2-user"
)

$ErrorActionPreference = "Stop"

Write-Host "`n================================" -ForegroundColor Green
Write-Host "AI Gateway EC2 Deployment" -ForegroundColor Green
Write-Host "================================`n" -ForegroundColor Green

Write-Host "EC2 IP: $EC2_IP" -ForegroundColor Cyan
Write-Host "Key: $KeyPath" -ForegroundColor Cyan
Write-Host "User: $EC2_User`n" -ForegroundColor Cyan

# Test SSH connection
Write-Host "Testing SSH connection..." -ForegroundColor Yellow
$testConnection = ssh -i $KeyPath -o ConnectTimeout=5 -o StrictHostKeyChecking=no $EC2_User@$EC2_IP "echo 'Connected successfully'" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to connect to EC2. Please check:" -ForegroundColor Red
    Write-Host "  - EC2 instance is running" -ForegroundColor Yellow
    Write-Host "  - Security group allows SSH (port 22) from your IP" -ForegroundColor Yellow
    Write-Host "  - EC2 IP address is correct: $EC2_IP" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Connected successfully!`n" -ForegroundColor Green

# Step 1: Install Docker
Write-Host "Step 1/6: Installing Docker..." -ForegroundColor Yellow
ssh -i $KeyPath $EC2_User@$EC2_IP @'
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user
'@

Write-Host "✓ Docker installed`n" -ForegroundColor Green

# Step 2: Install Docker Compose
Write-Host "Step 2/6: Installing Docker Compose..." -ForegroundColor Yellow
ssh -i $KeyPath $EC2_User@$EC2_IP @'
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version || echo "Docker Compose installed"
'@

Write-Host "✓ Docker Compose installed`n" -ForegroundColor Green

# Step 3: Setup application directory
Write-Host "Step 3/6: Setting up application directory..." -ForegroundColor Yellow
ssh -i $KeyPath $EC2_User@$EC2_IP @'
mkdir -p ~/ai-gateway
docker network create ai-gateway-network 2>/dev/null || echo "Network already exists"
'@

Write-Host "✓ Directory setup complete`n" -ForegroundColor Green

# Step 4: Generate JWT secrets
Write-Host "Step 4/6: Generating JWT secrets..." -ForegroundColor Yellow
$JWT_ACCESS = ssh -i $KeyPath $EC2_User@$EC2_IP "openssl rand -base64 32"
$JWT_REFRESH = ssh -i $KeyPath $EC2_User@$EC2_IP "openssl rand -base64 32"
$POSTGRES_PASSWORD = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | ForEach-Object {[char]$_})

Write-Host "✓ Secrets generated`n" -ForegroundColor Green

# Step 5: Create .env file
Write-Host "Step 5/6: Creating .env file..." -ForegroundColor Yellow
Write-Host "Please enter your OPENROUTER_API_KEY: " -ForegroundColor Cyan -NoNewline
$OPENROUTER_KEY = Read-Host

$envContent = @"
# ============================================
# Server Configuration
# ============================================
AI_GATEWAY_HOST=0.0.0.0
AI_GATEWAY_PORT=4180
NODE_ENV=production

# ============================================
# Database Configuration
# ============================================
POSTGRES_USER=aigateway
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=aigateway
DATABASE_URL=postgresql://aigateway:$POSTGRES_PASSWORD@ai-gateway-postgres:5432/aigateway

# ============================================
# Provider API Keys
# ============================================
OPENROUTER_API_KEY=$OPENROUTER_KEY
AI_GATEWAY_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ============================================
# Model Configuration
# ============================================
AI_GATEWAY_DEFAULT_MODEL=openai/gpt-4o-mini
AI_GATEWAY_DEFAULT_TEMPERATURE=0

AI_GATEWAY_PLANNER_MODEL=openai/gpt-4o-mini
AI_GATEWAY_EXECUTOR_MODEL=deepseek/deepseek-chat
AI_GATEWAY_FINAL_MODEL=openai/gpt-4o-mini

# ============================================
# Rate Limiting
# ============================================
AI_GATEWAY_FREE_RPM=20
AI_GATEWAY_FREE_DAILY_TOKENS=40000
AI_GATEWAY_PRO_RPM=120
AI_GATEWAY_PRO_DAILY_TOKENS=300000

# ============================================
# JWT Secrets
# ============================================
JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_REFRESH_SECRET=$JWT_REFRESH

# ============================================
# Google OAuth (Optional)
# ============================================
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ============================================
# Web Search (Optional)
# ============================================
TAVILY_API_KEY=
"@

# Upload .env file
$envContent | ssh -i $KeyPath $EC2_User@$EC2_IP "cat > ~/ai-gateway/.env"

Write-Host "✓ .env file created`n" -ForegroundColor Green

# Step 6: Deploy containers
Write-Host "Step 6/6: Deploying containers..." -ForegroundColor Yellow
Write-Host "Note: You need to push your code to GitHub first for CI/CD to build the image.`n" -ForegroundColor Cyan

# Start PostgreSQL
Write-Host "Starting PostgreSQL..." -ForegroundColor Yellow
ssh -i $KeyPath $EC2_User@$EC2_IP @"
docker run -d \
  --name ai-gateway-postgres \
  --restart unless-stopped \
  --network ai-gateway-network \
  -e POSTGRES_USER=aigateway \
  -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  -e POSTGRES_DB=aigateway \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine

sleep 5
docker ps | grep postgres
"@

Write-Host "✓ PostgreSQL started`n" -ForegroundColor Green

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "================================`n" -ForegroundColor Green

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Push your code to GitHub (main branch)" -ForegroundColor Cyan
Write-Host "2. GitHub Actions will build and deploy automatically" -ForegroundColor Cyan
Write-Host "3. Or manually pull image with:" -ForegroundColor Cyan
Write-Host "   ssh -i $KeyPath $EC2_User@$EC2_IP" -ForegroundColor White
Write-Host "`nYour EC2 is ready at: http://$EC2_IP:4180" -ForegroundColor Green
Write-Host "Security Group: Make sure port 4180 is open!`n" -ForegroundColor Yellow

Write-Host "To connect to your EC2:" -ForegroundColor Cyan
Write-Host "ssh -i `"$KeyPath`" $EC2_User@$EC2_IP`n" -ForegroundColor White
