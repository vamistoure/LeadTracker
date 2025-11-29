#!/usr/bin/env node
/**
 * Script de test pour diagnostiquer la synchronisation Supabase
 * 
 * Usage: node testSync.js
 */

const SUPABASE_URL = 'https://hcahvwbzgyeqkamephzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjYWh2d2J6Z3llcWthbWVwaHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjYyNDgsImV4cCI6MjA3OTc0MjI0OH0.wZu336fqjSTbCipcaVvni-MKT9iXB9uaO28gm8a5B-Y';

function convertLeadToSupabase(lead) {
  if (!lead) return lead;
  const converted = { ...lead };
  const mapping = {
    profileUrl: 'profile_url',
    searchTitle: 'search_title',
    requestDate: 'request_date',
    acceptanceDate: 'acceptance_date',
    contactedDate: 'contacted_date',
    conversionDate: 'conversion_date',
    topLead: 'top_lead',
    employeeRange: 'employee_range',
    companySegment: 'company_segment',
    companyIndustry: 'company_industry',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  };
  
  Object.keys(mapping).forEach((camelKey) => {
    if (camelKey in converted) {
      converted[mapping[camelKey]] = converted[camelKey];
      delete converted[camelKey];
    }
  });
  
  // Convertir les timestamps
  if ('created_at' in converted && converted.created_at && typeof converted.created_at === 'number') {
    converted.created_at = new Date(converted.created_at).toISOString();
  }
  if ('updated_at' in converted && converted.updated_at && typeof converted.updated_at === 'number') {
    converted.updated_at = new Date(converted.updated_at).toISOString();
  }
  
  // Supprimer l'ID si ce n'est pas un UUID
  if (converted.id && !converted.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    delete converted.id;
  }
  
  return converted;
}

// Test de conversion avec un lead qui a un company
const testLead = {
  id: 'test_' + Date.now(),
  name: 'Test User',
  headline: 'Test Headline',
  company: 'Test Company',
  profileUrl: 'https://linkedin.com/in/test',
  searchTitle: 'TEST',
  direction: 'outbound_pending',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

console.log('📋 Lead original:');
console.log(JSON.stringify(testLead, null, 2));

const converted = convertLeadToSupabase(testLead);
const { id, ...leadWithoutId } = converted;

console.log('\n🔄 Lead converti (sans ID):');
console.log(JSON.stringify(leadWithoutId, null, 2));

console.log('\n✅ Champ company préservé?', 'company' in leadWithoutId);
console.log('   Valeur:', leadWithoutId.company);

console.log('\n📊 Tous les champs du lead converti:');
console.log(Object.keys(leadWithoutId).join(', '));
