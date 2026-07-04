import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Admin
  const adminEmail = 'admin@yardex.local';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash('admin1234', 10),
        fullName: 'Yardex Admin',
        role: Role.ADMIN,
      },
    });
    console.log('Seeded admin:', adminEmail, '/ admin1234');
  }

  // Demo wholesaler
  const slug = 'yardex-demo';
  let wholesaler = await prisma.wholesaler.findUnique({ where: { slug } });
  if (!wholesaler) {
    wholesaler = await prisma.wholesaler.create({
      data: {
        name: 'Yardex Demo Dealer',
        slug,
        contactEmail: 'owner@yardex.local',
      },
    });
    await prisma.user.create({
      data: {
        email: 'owner@yardex.local',
        passwordHash: await bcrypt.hash('owner1234', 10),
        fullName: 'Yardex Owner',
        role: Role.WHOLESALER_OWNER,
        wholesalerId: wholesaler.id,
      },
    });
    await prisma.quoteTemplate.create({
      data: {
        wholesalerId: wholesaler.id,
        accentColor: '#0ea5e9',
        termsHtml: '<p>50% deposit required to start production. Balance due on delivery. Lead time 7 working days from deposit.</p>',
      },
    });
    console.log('Seeded demo dealer + owner login: owner@yardex.local / owner1234');
  }

  // Catalog
  const productSeeds = [
    { sku: 'PNL-PRV-6-BLK', name: 'Privacy Panel 6ft Black', category: 'PANEL', unit: 'pcs', basePrice: 89.0, heightOptions: ['4ft','5ft','6ft'], colorOptions: ['Black','White','Bronze'], description: 'Tongue-and-groove privacy panel, powder-coated aluminium.' },
    { sku: 'PNL-PKT-4-WHT', name: 'Picket Panel 4ft White', category: 'PANEL', unit: 'pcs', basePrice: 64.0, heightOptions: ['3ft','4ft','5ft'], colorOptions: ['White','Black'], description: 'Classic picket panel, 2.4m wide.' },
    { sku: 'POST-2.4', name: 'Post 2.4m', category: 'POST', unit: 'pcs', basePrice: 32.0, heightOptions: ['6ft','8ft'], colorOptions: ['Black','White','Bronze','Galvanized'], description: 'Heavy-duty aluminium post with cap.' },
    { sku: 'GATE-SGL-3', name: 'Single Gate 3ft', category: 'GATE', unit: 'pcs', basePrice: 220.0, heightOptions: ['4ft','5ft','6ft'], colorOptions: ['Black','White','Bronze'], description: 'Pre-hung single swing gate, includes hardware.' },
    { sku: 'GATE-DBL-8', name: 'Double Drive Gate 8ft', category: 'GATE', unit: 'pcs', basePrice: 540.0, heightOptions: ['4ft','5ft','6ft'], colorOptions: ['Black','White','Bronze'], description: 'Pre-hung double drive gate, includes hardware.' },
  ];
  const panelProducts: Record<string, string> = {};
  for (const p of productSeeds) {
    const created = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });
    panelProducts[p.sku] = created.id;
  }

  // Designs
  const designs = [
    { name: 'Privacy Black 6ft', style: 'Privacy', description: 'Tall, full-privacy black aluminium fence.', overlayUrl: '/static/overlays/privacy-black.png', config: { height: 1.8, color: '#0f172a', pattern: 'solid' } },
    { name: 'Picket White 4ft', style: 'Picket', description: 'Classic white picket fence.', overlayUrl: '/static/overlays/picket-white.png', config: { height: 1.2, color: '#f8fafc', pattern: 'picket' } },
    { name: 'Wrought Iron Bronze 5ft', style: 'Wrought Iron', description: 'Decorative wrought-iron look in bronze.', overlayUrl: '/static/overlays/wrought-bronze.png', config: { height: 1.5, color: '#92400e', pattern: 'ornamental' } },
  ];
  // Map designs to the products they cover. Coverage is in meters
  // per unit (1 panel covers 2.4m of fence).
  const designProductMap: Record<string, string[]> = {
    'Privacy':     [panelProducts['PNL-PRV-6-BLK']],
    'Picket':      [panelProducts['PNL-PKT-4-WHT']],
    'Wrought Iron':[panelProducts['POST-2.4']],
  };
  for (const d of designs) {
    const designId = `design-${d.style.toLowerCase().replace(/\s+/g,'-')}`;
    await prisma.design.upsert({
      where: { id: designId },
      update: {},
      create: { id: designId, ...d },
    });
    // Re-link products to designs
    const productIds = designProductMap[d.style] || [];
    for (const productId of productIds) {
      await prisma.designProduct.upsert({
        where: { designId_productId: { designId, productId } },
        update: { coverage: 2.4 },
        create: { designId, productId, coverage: 2.4 },
      });
    }
  }

  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
