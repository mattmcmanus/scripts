#!/usr/bin/env bun

/**
 * Dynamic DNS Update Script for Cloudflare
 * 
 * Updates a Cloudflare DNS record with your current public IP address.
 * Only updates if the IP has changed from the current DNS record.
 * 
 * Usage: bun run ddns-update.ts --zone-id ZONE_ID --record-id RECORD_ID [--domain DOMAIN] [--debug]
 *        bun run ddns-update.ts -z ZONE_ID -r RECORD_ID [-d DOMAIN] [--debug]
 * 
 * Required Environment Variables:
 *   CF_API_TOKEN - Your Cloudflare API token
 * 
 * Arguments:
 *   -z, --zone-id    - Cloudflare Zone ID
 *   -r, --record-id  - DNS Record ID to update
 *   -d, --domain     - Domain name (optional, uses existing if not provided)
 *       --debug      - Show current status without making changes
 *   -h, --help       - Show help message
 * 
 * Example: bun run ddns-update.ts -z abc123 -r xyz789 -d home.example.com --debug
 */

import { parseArgs } from 'node:util';
import Cloudflare from 'cloudflare';

interface UpdateDNSOptions {
  zoneId: string;
  recordId: string;
  domain?: string;
  debug?: boolean;
}

async function getCurrentPublicIP(): Promise<string> {
  const response = await fetch('https://api.ipify.org');
  return response.text();
}

async function updateDNSRecord({ zoneId, recordId, domain, debug }: UpdateDNSOptions) {
  // Get API token from environment variable
  const apiToken = process.env.CF_API_TOKEN;
  if (!apiToken) {
    console.error('Error: CF_API_TOKEN environment variable is required');
    process.exit(1);
  }

  // Initialize Cloudflare client
  const cf = new Cloudflare({
    apiToken: apiToken,
  });

  try {
    // Get current public IP
    const currentIP = await getCurrentPublicIP();
    console.log(`Current public IP: ${currentIP}`);

    // Get DNS record from Cloudflare
    const dnsRecord = await cf.dns.records.get(recordId, {
      zone_id: zoneId,
    });

    const cloudflareIP = dnsRecord.content;
    console.log(`Cloudflare DNS record IP: ${cloudflareIP}`);

    // Compare IPs
    if (currentIP !== cloudflareIP) {
      console.log(`\n🔄 IP has changed from ${cloudflareIP} to ${currentIP}`);
      
      if (debug) {
        return;
      }

      // Update DNS record
      const updateData = {
        type: 'A' as const,
        content: currentIP,
        ttl: 120,
        proxied: false,
        zone_id: zoneId,
        // Include domain name if provided, otherwise use the existing one
        name: domain || dnsRecord.name,
      };

      await cf.dns.records.update(recordId, updateData);
      console.log('✅ DNS record updated successfully');
    } else {
      if (debug) {
        console.log('🐛 Debug mode: Current IP matches DNS record');
      }
    }
  } catch (error) {
    console.error('❌ Error updating DNS record:', error);
    process.exit(1);
  }
}

// Parse command line arguments using node:util parseArgs
function getArgs(): { zoneId: string; recordId: string; domain?: string; debug?: boolean } {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'zone-id': {
        type: 'string',
        short: 'z',
      },
      'record-id': {
        type: 'string',
        short: 'r',
      },
      'domain': {
        type: 'string',
        short: 'd',
      },
      'debug': {
        type: 'boolean',
      },
      'help': {
        type: 'boolean',
        short: 'h',
      },
    },
    allowPositionals: false,
  });

  // Handle help option
  if (values.help) {
    console.log('Usage: bun run ddns-update.ts --zone-id ZONE_ID --record-id RECORD_ID [--domain DOMAIN] [--debug]');
    console.log('Environment variable required: CF_API_TOKEN');
    console.log('\nOptions:');
    console.log('  -z, --zone-id     Cloudflare Zone ID (required)');
    console.log('  -r, --record-id   DNS Record ID to update (required)');
    console.log('  -d, --domain      Domain name (optional)');
    console.log('      --debug       Show current IP status without making changes');
    console.log('  -h, --help        Show this help message');
    process.exit(0);
  }

  // Validate required arguments
  if (!values['zone-id'] || !values['record-id']) {
    console.error('Error: --zone-id and --record-id are required');
    console.error('Usage: bun run ddns-update.ts --zone-id ZONE_ID --record-id RECORD_ID [--domain DOMAIN]');
    process.exit(1);
  }

  return {
    zoneId: values['zone-id']!,
    recordId: values['record-id']!,
    domain: values.domain,
    debug: values.debug,
  };
}

// Run the script
if (import.meta.main) {
  const { zoneId, recordId, domain, debug } = getArgs();
  await updateDNSRecord({ zoneId, recordId, domain, debug });
}
