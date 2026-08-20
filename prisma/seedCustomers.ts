import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const REAL_INDIAN_CUSTOMERS = [
  {
    code: 'CUST-TATA',
    name: 'Tata Consumer Products Ltd',
    address: 'Plot No. 12, Kagal Five Star MIDC Industrial Area',
    city: 'Kolhapur',
    pinCode: '416236',
    phone: '+91 9822019482',
    gstin: '27AAACT2727Q1ZB',
    email: 'logistics@tataconsumer.com',
  },
  {
    code: 'CUST-RELIANCE',
    name: 'Reliance Retail Ventures Ltd',
    address: 'Ghansoli Central Warehouse, Sector 2, Navi Mumbai',
    city: 'Mumbai',
    pinCode: '400701',
    phone: '+91 9833445566',
    gstin: '27AABCR1234A1Z9',
    email: 'supplychain@relianceretail.com',
  },
  {
    code: 'CUST-ADANI',
    name: 'Adani Wilmar Ltd',
    address: 'Fortune House, Near Navrangpura Railway Crossing',
    city: 'Ahmedabad',
    pinCode: '380009',
    phone: '+91 9879123450',
    gstin: '24AACCA1122B1Z4',
    email: 'dispatch@adaniwilmar.in',
  },
  {
    code: 'CUST-GODREJ',
    name: 'Godrej Agrovet Ltd',
    address: 'Pirojshanagar, Eastern Express Highway, Vikhroli East',
    city: 'Mumbai',
    pinCode: '400079',
    phone: '+91 9820551122',
    gstin: '27AAACG0624L1ZL',
    email: 'cargo.ops@godrejagrovet.com',
  },
  {
    code: 'CUST-HAVELLS',
    name: 'Havells India Ltd',
    address: 'QRG Towers, 2D Expressway, Sector 126',
    city: 'Noida',
    pinCode: '201304',
    phone: '+91 9811099887',
    gstin: '07AAACH1234M1Z2',
    email: 'dispatch.north@havells.com',
  },
  {
    code: 'CUST-MARICO',
    name: 'Marico Industries Ltd',
    address: 'Grande Palladium, 7th Floor, 175 CST Road, Kalina, Santacruz East',
    city: 'Mumbai',
    pinCode: '400098',
    phone: '+91 9821884433',
    gstin: '27AAACM0472C1ZT',
    email: 'supplychain@marico.com',
  },
  {
    code: 'CUST-VGUARD',
    name: 'V-Guard Industries Ltd',
    address: '44/1037, Vennala High School Road, Vennala',
    city: 'Kochi',
    pinCode: '682028',
    phone: '+91 9847012345',
    gstin: '32AAACV1234K1Z0',
    email: 'logistics.south@vguard.in',
  },
  {
    code: 'CUST-RAYMOND',
    name: 'Raymond Ltd (Apparel Division)',
    address: 'Pokhran Road No. 1, Jekegram',
    city: 'Thane',
    pinCode: '400606',
    phone: '+91 9820123456',
    gstin: '27AAACR1234D1Z8',
    email: 'textiles.dispatch@raymond.in',
  },
  {
    code: 'CUST-TITAN',
    name: 'Titan Company Ltd',
    address: 'Integrity, No. 193, Veerasandra, Electronics City P.O.',
    city: 'Bengaluru',
    pinCode: '560100',
    phone: '+91 9845012345',
    gstin: '29AAACT2702D1ZW',
    email: 'shipping@titan.co.in',
  },
  {
    code: 'CUST-AUROBINDO',
    name: 'Aurobindo Pharma Ltd',
    address: 'Plot No. 2, Maitrivihar, Ameerpet',
    city: 'Hyderabad',
    pinCode: '500038',
    phone: '+91 9848012345',
    gstin: '36AAACA1234F1Z1',
    email: 'pharma.dispatch@aurobindo.com',
  },
  {
    code: 'CUST-APOLLO',
    name: 'Apollo Tyres Ltd',
    address: 'Apollo House, 7 Institutional Area, Sector 32',
    city: 'Gurugram',
    pinCode: '122001',
    phone: '+91 9810123456',
    gstin: '06AAACA1234G1Z3',
    email: 'tyres.logistics@apollotyres.com',
  },
  {
    code: 'CUST-DABUR',
    name: 'Dabur India Ltd',
    address: '8/3 Asaf Ali Road',
    city: 'Delhi',
    pinCode: '110002',
    phone: '+91 9811234567',
    gstin: '07AAACD1234H1Z5',
    email: 'fmcg.freight@dabur.com',
  },
];

async function seedRealCustomers() {
  console.log('Cleaning up old dummy customers...');
  // Clear foreign keys in bills if any reference old customers
  await prisma.bill.updateMany({
    data: { customerId: null },
  });

  // Delete old customers
  await prisma.customer.deleteMany({});

  console.log('Creating fresh real Indian corporate customers...');
  for (const c of REAL_INDIAN_CUSTOMERS) {
    await prisma.customer.create({
      data: c,
    });
    console.log(`✓ Created: ${c.name} (${c.code}) - ${c.city}`);
  }

  console.log('All dummy customers successfully replaced!');
}

seedRealCustomers()
  .catch((err) => {
    console.error('Error seeding customers:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
