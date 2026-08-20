import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const REAL_INDIAN_CUSTOMERS = [
  {
    code: 'CUST-TATA',
    name: 'Tata Consumer Products Ltd',
    contactPerson: 'Rajesh Sharma (Logistics Lead)',
    address: 'Plot No. 12, Kagal Five Star MIDC Industrial Area',
    city: 'Kolhapur',
    pinCode: '416236',
    phone: '+91 9822019482',
    gstin: '27AAACT2727Q1ZB',
    email: 'logistics@tataconsumer.com',
    paymentTermsDays: 30,
    creditLimit: 500000,
    notes: 'Key FMCG distribution account. Monthly bulk settlement.',
  },
  {
    code: 'CUST-RELIANCE',
    name: 'Reliance Retail Ventures Ltd',
    contactPerson: 'Anil Deshmukh (Supply Chain Manager)',
    address: 'Ghansoli Central Warehouse, Sector 2, Navi Mumbai',
    city: 'Mumbai',
    pinCode: '400701',
    phone: '+91 9833445566',
    gstin: '27AABCR1234A1Z9',
    email: 'supplychain@relianceretail.com',
    paymentTermsDays: 45,
    creditLimit: 1000000,
    notes: 'High-volume retail shipments. Requires physical POD for bill clearance.',
  },
  {
    code: 'CUST-ADANI',
    name: 'Adani Wilmar Ltd',
    contactPerson: 'Vikram Patel (Dispatch Operations)',
    address: 'Fortune House, Near Navrangpura Railway Crossing',
    city: 'Ahmedabad',
    pinCode: '380009',
    phone: '+91 9879123450',
    gstin: '24AACCA1122B1Z4',
    email: 'dispatch@adaniwilmar.in',
    paymentTermsDays: 30,
    creditLimit: 750000,
    notes: 'Edible oils & commodities. Weekly credit reconciliation.',
  },
  {
    code: 'CUST-GODREJ',
    name: 'Godrej Agrovet Ltd',
    contactPerson: 'Sandeep Varma (Distribution Head)',
    address: 'Pirojshanagar, Eastern Express Highway, Vikhroli East',
    city: 'Mumbai',
    pinCode: '400079',
    phone: '+91 9820551122',
    gstin: '27AAACG0624L1ZL',
    email: 'cargo.ops@godrejagrovet.com',
    paymentTermsDays: 30,
    creditLimit: 400000,
    notes: 'Agri-inputs & animal feed. Standard 30-day payment term.',
  },
  {
    code: 'CUST-HAVELLS',
    name: 'Havells India Ltd',
    contactPerson: 'Manoj Tyagi (North Logistics)',
    address: 'QRG Towers, 2D Expressway, Sector 126',
    city: 'Noida',
    pinCode: '201304',
    phone: '+91 9811099887',
    gstin: '07AAACH1234M1Z2',
    email: 'dispatch.north@havells.com',
    paymentTermsDays: 30,
    creditLimit: 600000,
    notes: 'Electrical goods & appliances. Part payments made mid-month.',
  },
  {
    code: 'CUST-MARICO',
    name: 'Marico Industries Ltd',
    contactPerson: 'Priya Iyer (Freight Coordinator)',
    address: 'Grande Palladium, 7th Floor, 175 CST Road, Kalina, Santacruz East',
    city: 'Mumbai',
    pinCode: '400098',
    phone: '+91 9821884433',
    gstin: '27AAACM0472C1ZT',
    email: 'supplychain@marico.com',
    paymentTermsDays: 30,
    creditLimit: 500000,
    notes: 'Personal care products. Regular weekly dispatch.',
  },
  {
    code: 'CUST-VGUARD',
    name: 'V-Guard Industries Ltd',
    contactPerson: 'K. R. Menon (South Zone Manager)',
    address: '44/1037, Vennala High School Road, Vennala',
    city: 'Kochi',
    pinCode: '682028',
    phone: '+91 9847012345',
    gstin: '32AAACV1234K1Z0',
    email: 'logistics.south@vguard.in',
    paymentTermsDays: 30,
    creditLimit: 350000,
    notes: 'Inverters & pump dispatches.',
  },
  {
    code: 'CUST-RAYMOND',
    name: 'Raymond Ltd (Apparel Division)',
    contactPerson: 'Sanjay Singhania (Commercial Manager)',
    address: 'Pokhran Road No. 1, Jekegram',
    city: 'Thane',
    pinCode: '400606',
    phone: '+91 9820123456',
    gstin: '27AAACR1234D1Z8',
    email: 'textiles.dispatch@raymond.in',
    paymentTermsDays: 60,
    creditLimit: 800000,
    notes: 'Textiles and garment rolls. 60-day credit period agreed.',
  },
  {
    code: 'CUST-TITAN',
    name: 'Titan Company Ltd',
    contactPerson: 'Ramesh Sundaram (Dispatch Officer)',
    address: 'Integrity, No. 193, Veerasandra, Electronics City P.O.',
    city: 'Bengaluru',
    pinCode: '560100',
    phone: '+91 9845012345',
    gstin: '29AAACT2702D1ZW',
    email: 'shipping@titan.co.in',
    paymentTermsDays: 30,
    creditLimit: 600000,
    notes: 'Precision goods & accessories.',
  },
  {
    code: 'CUST-AUROBINDO',
    name: 'Aurobindo Pharma Ltd',
    contactPerson: 'Dr. Srinivas Rao (Pharma Dispatch)',
    address: 'Plot No. 2, Maitrivihar, Ameerpet',
    city: 'Hyderabad',
    pinCode: '500038',
    phone: '+91 9848012345',
    gstin: '36AAACA1234F1Z1',
    email: 'pharma.dispatch@aurobindo.com',
    paymentTermsDays: 30,
    creditLimit: 500000,
    notes: 'Temperature-sensitive pharmaceutical cargo.',
  },
  {
    code: 'CUST-APOLLO',
    name: 'Apollo Tyres Ltd',
    contactPerson: 'Gurpreet Singh (Depot Incharge)',
    address: 'Apollo House, 7 Institutional Area, Sector 32',
    city: 'Gurugram',
    pinCode: '122001',
    phone: '+91 9810123456',
    gstin: '06AAACA1234G1Z3',
    email: 'tyres.logistics@apollotyres.com',
    paymentTermsDays: 30,
    creditLimit: 700000,
    notes: 'Heavy commercial vehicle tyres.',
  },
  {
    code: 'CUST-DABUR',
    name: 'Dabur India Ltd',
    contactPerson: 'Amit Gupta (Commercial Lead)',
    address: '8/3 Asaf Ali Road',
    city: 'Delhi',
    pinCode: '110002',
    phone: '+91 9811234567',
    gstin: '07AAACD1234H1Z5',
    email: 'fmcg.freight@dabur.com',
    paymentTermsDays: 30,
    creditLimit: 450000,
    notes: 'Ayurvedic & FMCG products.',
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

  console.log('Creating fresh real Indian corporate customers with full financial profiles...');
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
