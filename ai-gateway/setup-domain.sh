#!/bin/bash
# Setup script for configuring custom domain with Nginx and Let's Encrypt SSL

DOMAIN="${1:-trymemento.in}"
EMAIL="${2:-admin@trymemento.in}"

echo "Setting up domain: $DOMAIN"
echo "Email for SSL cert: $EMAIL"

# Install Nginx
sudo dnf install -y nginx

# Install Certbot for Let's Encrypt
sudo dnf install -y certbot python3-certbot-nginx

# Create Nginx configuration
sudo tee /etc/nginx/conf.d/ai-gateway.conf > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Temporary redirect to allow certbot to verify domain
    location / {
        proxy_pass http://localhost:4180;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo "Nginx configured. Testing configuration..."
sudo nginx -t

# Get SSL certificate
echo "Obtaining SSL certificate..."
sudo certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --no-eff-email --redirect

echo ""
echo "✅ Setup complete!"
echo "Your API Gateway should now be accessible at: https://$DOMAIN"
echo ""
echo "To renew SSL automatically, certbot timer is enabled by default."
echo "Check with: sudo systemctl status certbot-renew.timer"
