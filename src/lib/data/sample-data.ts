/**
 * Realistic sample data for template placeholders.
 * Used to generate sample/preview documents so users can see
 * what a template looks like before filling in their own data.
 */

import { PLACEHOLDER_IMAGES } from '@/lib/utils/image-placeholders';

/**
 * Generate realistic sample values for common placeholder keys.
 * Returns a Record<string, string> that can be passed to the document generator.
 */
export function generateSampleVariables(placeholders: string[]): Record<string, string> {
  const samples: Record<string, string> = {};

  for (const key of placeholders) {
    samples[key] = getSampleValue(key);
  }

  return samples;
}

function getSampleValue(key: string): string {
  const lower = key.toLowerCase();

  // ─── Company Info ───
  if (lower === 'companyname') return 'Acme Corporation Pvt. Ltd.';
  if (lower === 'companyaddress') return '123, Business Park, MG Road, Bangalore - 560001, Karnataka, India';
  if (lower === 'companyemail') return 'info@acmecorp.com';
  if (lower === 'companyphone') return '+91 80 4567 8900';
  if (lower === 'companywebsite') return 'www.acmecorp.com';
  if (lower === 'companylogo') return PLACEHOLDER_IMAGES.logo;
  if (lower === 'companyseal') return PLACEHOLDER_IMAGES.seal;

  // ─── Employee Info ───
  if (lower === 'employeename') return 'Rahul Sharma';
  if (lower === 'employeeid') return 'EMP-2024-0427';
  if (lower === 'employeephoto') return PLACEHOLDER_IMAGES.photo;
  if (lower === 'designation') return 'Senior Software Engineer';
  if (lower === 'department') return 'Engineering';
  if (lower === 'location') return 'Bangalore';
  if (lower === 'manager') return 'Vikram Patel';
  if (lower === 'hrname') return 'Priya Singh';
  if (lower === 'ceoname') return 'Arun Kumar';
  if (lower === 'supervisor') return 'Ravi Deshmukh';

  // ─── Dates ───
  if (lower === 'joiningdate' || lower === 'appointmentdate') return '15 January 2024';
  if (lower === 'relievingdate' || lower === 'lastworkingday') return '14 January 2026';
  if (lower === 'effectivedate') return '01 March 2024';
  if (lower === 'currentdate') return new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  if (lower.includes('invoicedate')) return '01 March 2024';
  if (lower.includes('duedate')) return '15 March 2024';
  if (lower.includes('quotationdate')) return '01 March 2024';
  if (lower === 'validuntil') return '31 March 2024';
  if (lower === 'payperiod') return 'February 2024';
  if (lower === 'paydate') return '28 February 2024';
  if (lower.includes('startdate')) return '01 January 2024';
  if (lower.includes('enddate')) return '31 December 2024';
  if (lower.includes('issuedate')) return '01 March 2024';
  if (lower.includes('possessiondate')) return '15 June 2024';
  if (lower.includes('handoverdate')) return '15 June 2024';

  // ─── Salary & Financial ───
  if (lower === 'salary') return '75,000';
  if (lower === 'ctc') return '12,00,000';
  if (lower === 'oldctc') return '9,00,000';
  if (lower === 'newctc') return '12,00,000';
  if (lower === 'incrementamount') return '3,00,000';
  if (lower === 'incrementpercentage') return '33';
  if (lower === 'oldsalary') return '55,000';
  if (lower === 'newsalary') return '75,000';
  if (lower === 'basic') return '30,000';
  if (lower === 'da') return '5,000';
  if (lower === 'hra') return '15,000';
  if (lower === 'conveyance') return '3,200';
  if (lower === 'medical') return '2,500';
  if (lower === 'specialallowance') return '19,300';
  if (lower === 'grossearnings') return '75,000';
  if (lower === 'pf') return '3,600';
  if (lower === 'esi') return '1,200';
  if (lower === 'professionaltax') return '200';
  if (lower === 'incometax') return '5,000';
  if (lower === 'totaldeductions') return '10,000';
  if (lower === 'netpay') return '65,000';
  if (lower === 'netpaywords') return 'Sixty-Five Thousand Only';
  if (lower === 'subtotal') return '1,00,000';
  if (lower === 'grandtotal') return '1,18,000';
  if (lower === 'totaltax') return '18,000';
  if (lower === 'cgst') return '9,000';
  if (lower === 'sgst') return '9,000';
  if (lower === 'igst') return '18,000';
  if (lower === 'totalinwords') return 'One Lakh Eighteen Thousand Only';
  if (lower === 'discount') return '5,000';
  if (lower === 'taxpercentage') return '18';
  if (lower === 'taxamount') return '17,100';
  if (lower === 'baseprice') return '75,00,000';
  if (lower.includes('totalcost')) return '82,50,000';
  if (lower.includes('bookingamount')) return '5,00,000';
  if (lower.includes('registrationcharges')) return '1,50,000';

  // ─── Document Numbers ───
  if (lower === 'invoicenumber') return 'INV-2024-0042';
  if (lower === 'quotationnumber') return 'QTN-2024-0089';
  if (lower.includes('workordernumber')) return 'WO-2024-0156';
  if (lower.includes('reportnumber')) return 'QC-2024-0234';
  if (lower.includes('requisitionnumber')) return 'MRN-2024-0078';
  if (lower.includes('certificatenumber')) return 'CERT-2024-0312';

  // ─── PAN / GST / Bank ───
  if (lower === 'pan') return 'AABCP1234D';
  if (lower === 'gst') return '29AABCP1234D1Z5';
  if (lower === 'cin') return 'U72200KA2024PTC123456';
  if (lower === 'bankname') return 'State Bank of India';
  if (lower === 'bankaccount') return '12345678901';
  if (lower === 'bankifsc') return 'SBIN0001234';
  if (lower === 'uan') return '101234567890';

  // ─── Buyer / Client ───
  if (lower === 'buyername' || lower === 'clientname') return 'TechSolutions India Ltd.';
  if (lower === 'buyeraddress' || lower === 'clientaddress') return '456, Tech Park, Whitefield, Bangalore - 560066';
  if (lower === 'buyergst') return '29ABCDE1234F1Z6';
  if (lower === 'buyerstate') return 'Karnataka';
  if (lower === 'buyerstatecode') return '29';
  if (lower === 'clientemail') return 'purchasing@techsolutions.in';
  if (lower === 'clientcontact') return '+91 98765 43210';
  if (lower === 'clientcompany') return 'TechSolutions India Ltd.';

  // ─── Signatures ───
  if (lower.includes('signature')) return PLACEHOLDER_IMAGES.signature;
  if (lower === 'authorizedsignature' || lower === 'authorizedsign') return PLACEHOLDER_IMAGES.signature;

  // ─── Images ───
  if (lower.includes('logo')) return PLACEHOLDER_IMAGES.logo;
  if (lower.includes('photo') || lower.includes('picture')) return PLACEHOLDER_IMAGES.photo;
  if (lower.includes('heroimage') || lower.includes('imageurl')) return PLACEHOLDER_IMAGES.generic;

  // ─── Education ───
  if (lower === 'institutionname') return 'St. Xavier\'s College';
  if (lower === 'institutionaddress') return 'College Road, Ahmedabad - 380009';
  if (lower === 'institutionlogo') return PLACEHOLDER_IMAGES.logo;
  if (lower === 'studentname') return 'Aditya Verma';
  if (lower === 'studentclass') return 'Class XII - Science';
  if (lower === 'studentrollno') return '2024-0078';
  if (lower === 'academicyear') return '2024-2025';
  if (lower === 'principalname') return 'Dr. Suresh Iyer';

  // ─── Doctors / Medical ───
  if (lower === 'doctorname') return 'Dr. Meera Reddy';
  if (lower === 'doctorqualification') return 'MBBS, MD (Internal Medicine)';
  if (lower === 'clinicname') return 'City Care Medical Center';
  if (lower === 'clinicaddress') return '789, Health Avenue, Jubilee Hills, Hyderabad - 500033';
  if (lower === 'cliniclogo') return PLACEHOLDER_IMAGES.logo;
  if (lower === 'patientname') return 'Suresh Kumar';
  if (lower === 'patientage') return '35';
  if (lower === 'patientgender') return 'Male';
  if (lower === 'diagnosis') return 'Acute Bronchitis with mild fever';
  if (lower === 'advice') return 'Take prescribed medication, complete bed rest for 3 days, stay hydrated';
  if (lower === 'sickdays') return '3';
  if (lower === 'fromdate') return '01 March 2024';
  if (lower === 'todate') return '03 March 2024';
  if (lower === 'medicinedetails') return 'Tab. Amoxicillin 500mg - 3x/day, Tab. Paracetamol 650mg - SOS, Syrup Cough Relief - 2x/day';
  if (lower === 'registrationno') return 'KMC-56789';

  // ─── Total Experience ───
  if (lower === 'totalexperience') return '2 Years 0 Months';
  if (lower === 'skills') return 'JavaScript, React, Node.js, TypeScript, PostgreSQL, AWS';
  if (lower === 'skillsacquired') return 'Full-stack development, Agile methodologies, Team leadership, Client communication';

  // ─── NDA / Legal ───
  if (lower === 'partyaname') return 'Acme Corporation Pvt. Ltd.';
  if (lower === 'partyaaddress') return '123, Business Park, MG Road, Bangalore - 560001';
  if (lower === 'partybname') return 'TechSolutions India Ltd.';
  if (lower === 'partybaddress') return '456, Tech Park, Whitefield, Bangalore - 560066';
  if (lower === 'jurisdiction') return 'Bangalore, Karnataka';
  if (lower === 'termyears') return '5';
  if (lower === 'nda_signature_partyb') return PLACEHOLDER_IMAGES.signature;

  // ─── Working Days/Hours ───
  if (lower === 'workingdays') return 'Monday to Friday (5 days a week)';
  if (lower === 'workinghours') return '9:00 AM to 6:00 PM (IST)';
  if (lower === 'leavepolicy') return 'Eligible for 18 casual leaves, 12 sick leaves, and 24 earned leaves per annum as per company policy.';
  if (lower === 'noticeperiod') return '30 days';

  // ─── Resume ───
  if (lower === 'fullname') return 'Rahul Sharma';
  if (lower === 'phone') return '+91 98765 43210';
  if (lower === 'linkedin') return 'linkedin.com/in/rahulsharma';
  if (lower === 'portfolio') return 'rahulsharma.dev';
  if (lower === 'professionalsummary') return 'Experienced software engineer with 5+ years of expertise in building scalable web applications using React, Node.js, and cloud technologies. Passionate about creating elegant solutions to complex problems.';
  if (lower === 'workexperience') return 'Senior Software Engineer, Acme Corp (2022-Present)\n• Led development of microservices architecture serving 1M+ users\n• Improved API response times by 40% through optimization\nSoftware Engineer, TechStart Inc. (2020-2022)\n• Built real-time analytics dashboard using React and WebSockets';
  if (lower === 'education') return 'B.Tech in Computer Science, IIT Bombay (2016-2020)\nCGPA: 8.7/10';
  if (lower === 'certifications') return '• AWS Certified Solutions Architect (2023)\n• Google Cloud Professional Developer (2022)';
  if (lower === 'languages') return 'English (Fluent), Hindi (Native), Kannada (Conversational)';
  if (lower === 'achievements') return '• Best Employee Award - Q4 2023\n• Published 2 technical articles on Medium\n• Open source contributor to React ecosystem';

  // ─── Cover Letter ───
  if (lower === 'hiringmanagername') return 'Ms. Ananya Gupta';
  if (lower === 'position') return 'Senior Software Engineer';
  if (lower === 'jobsource') return 'LinkedIn';
  if (lower === 'coverbody') return 'I am writing to express my strong interest in the Senior Software Engineer position at your company. With over 5 years of experience in full-stack development and a proven track record of delivering high-impact solutions, I am confident that my skills and experience align perfectly with your requirements.\n\nIn my current role at Acme Corp, I have successfully led the development of multiple critical projects, including a real-time analytics platform that serves over 1 million users. My expertise in React, Node.js, and cloud technologies, combined with my passion for writing clean, maintainable code, makes me an ideal candidate for this role.\n\nI am particularly excited about the opportunity to work on innovative products and contribute to the growth of your engineering team. I look forward to the possibility of discussing how my experience can benefit your organization.';

  // ─── Meeting ───
  if (lower === 'meetingtitle') return 'Q1 2024 Product Roadmap Review';
  if (lower === 'meetingdate') return '15 January 2024';
  if (lower === 'meetingtime') return '10:00 AM - 11:30 AM';
  if (lower === 'meetinglocation') return 'Conference Room A';
  if (lower === 'chairperson') return 'Arun Kumar (CEO)';
  if (lower === 'attendees') return 'Rahul Sharma, Priya Singh, Vikram Patel, Ananya Gupta, Ravi Deshmukh';
  if (lower === 'agenda') return '1. Review Q4 2023 performance\n2. Q1 2024 product roadmap discussion\n3. Feature prioritization\n4. Resource allocation\n5. Timeline and milestones';
  if (lower === 'discussionpoints') return '• Q4 revenue exceeded targets by 15%\n• Customer acquisition cost reduced by 20%\n• Three major feature requests from enterprise clients\n• Team capacity constraints identified\n• New market expansion opportunities discussed';
  if (lower === 'decisions') return '• Priority: Launch customer portal by March 2024\n• Allocate 2 additional engineers to the mobile team\n• Postpone AI features to Q2 2024\n• Approve budget for cloud infrastructure upgrade';
  if (lower === 'actionitemstable') return '| Action Item | Owner | Deadline |\n|---|---|---|\n| Finalize Q1 roadmap | Vikram Patel | Jan 20 |\n| Hire 2 backend engineers | Priya Singh | Feb 15 |\n| Begin customer portal development | Ravi Deshmukh | Jan 25 |\n| Cloud migration proposal | Rahul Sharma | Feb 1 |';
  if (lower === 'nextmeeting') return '12 February 2024, 10:00 AM';

  // ─── Marketing ───
  if (lower === 'postheadline') return 'Introducing Our Next-Generation Platform 🚀';
  if (lower === 'postbody') return 'We are thrilled to announce the launch of our completely redesigned platform! After months of hard work, listening to customer feedback, and pushing the boundaries of what\'s possible, we\'re proud to present a faster, smarter, and more intuitive experience.\n\nKey highlights:\n✨ 2x faster performance\n🎨 Beautiful new interface\n🔒 Enhanced security features\n📊 Advanced analytics dashboard\n\nTry it today and experience the difference!';
  if (lower === 'calltoaction') return 'Get Started Free Today →';
  if (lower === 'hashtags') return '#ProductLaunch #Innovation #Technology #SaaS #DigitalTransformation';
  if (lower === 'authorname') return 'Rahul Sharma';
  if (lower === 'postdate') return '15 January 2024';
  if (lower === 'linkurl') return 'https://acmecorp.com/launch';

  // ─── Email Campaign ───
  if (lower === 'emailsubject') return 'Exclusive Offer: 20% Off on Premium Plans';
  if (lower === 'greeting') return 'Dear Customer,';
  if (lower === 'emailbody') return 'We hope this message finds you well! We\'re reaching out to share an exclusive opportunity to upgrade your experience with our premium features.\n\nFor a limited time, we\'re offering a special 20% discount on all annual premium plans. This is the perfect time to unlock the full potential of our platform and take your productivity to the next level.';
  if (lower === 'promoheadline') return 'Limited Time Offer!';
  if (lower === 'promodescription') return 'Get 20% off on all annual premium plans. Upgrade now and save big!';
  if (lower === 'promocode') return 'PREMIUM20';
  if (lower === 'discountpercentage') return '20';
  if (lower === 'ctatext' || lower === 'cta_text') return 'Claim Your Discount';
  if (lower === 'cta_link') return 'https://acmecorp.com/upgrade';
  if (lower === 'footertext') return 'You are receiving this email because you signed up for Acme Corp. If you wish to unsubscribe, click the link below.';
  if (lower === 'unsubscribelink') return 'https://acmecorp.com/unsubscribe';

  // ─── Brochure ───
  if (lower === 'brochuretitle') return 'Empower Your Business with Next-Gen Solutions';
  if (lower === 'brochuresubtitle') return 'Transform your workflow with our cutting-edge platform';
  if (lower === 'feature1_title') return 'Smart Automation';
  if (lower === 'feature1_desc') return 'Automate repetitive tasks and focus on what matters most. Our AI-powered engine handles the heavy lifting.';
  if (lower === 'feature2_title') return 'Real-time Analytics';
  if (lower === 'feature2_desc') return 'Get instant insights with beautiful dashboards. Make data-driven decisions in real-time.';
  if (lower === 'feature3_title') return 'Seamless Integration';
  if (lower === 'feature3_desc') return 'Connect with your favorite tools effortlessly. 100+ integrations out of the box.';
  if (lower === 'feature4_title') return 'Enterprise Security';
  if (lower === 'feature4_desc') return 'Bank-grade encryption, SOC 2 compliance, and granular access controls.';
  if (lower === 'pricingheadline') return 'Simple, Transparent Pricing';
  if (lower === 'priceamount') return '₹2,990';
  if (lower === 'priceperiod') return '/year';
  if (lower === 'pricedetails') return 'Includes all features, priority support, and regular updates. No hidden fees.';
  // ─── Proposal ───
  if (lower === 'proposaltitle') return 'Digital Transformation Initiative - Q1 2024';
  if (lower === 'executivesummary') return 'This proposal outlines a comprehensive digital transformation strategy for TechSolutions India Ltd. The project aims to modernize existing infrastructure, implement cloud-native solutions, and enhance operational efficiency by 40% over the next 12 months.';
  if (lower === 'scopeofwork') return '1. Infrastructure assessment and migration plan\n2. Cloud architecture design and implementation\n3. Legacy system modernization\n4. CI/CD pipeline setup\n5. Team training and documentation\n6. Post-migration support (3 months)';
  if (lower === 'projecttimeline') return 'Phase 1: Assessment & Planning (4 weeks)\nPhase 2: Architecture Design (3 weeks)\nPhase 3: Implementation (12 weeks)\nPhase 4: Testing & Deployment (4 weeks)\nPhase 5: Training & Handover (2 weeks)';
  if (lower === 'projectcost') return '₹ 25,00,000 (Rupees Twenty-Five Lakhs Only)';
  if (lower === 'paymentterms') return '30% advance, 40% on milestone completion, 30% on project delivery. Net 30 days from invoice.';
  if (lower === 'deliveryterms') return 'Delivery within 25 weeks from project kickoff. Milestone-based delivery with weekly progress reviews.';
  if (lower === 'teammembers') return 'Project Manager: Vikram Patel\nTech Lead: Rahul Sharma\nCloud Architect: Ananya Gupta\nDeveloper: Ravi Deshmukh';

  // ─── Real Estate ───
  if (lower === 'propertyaddress') return 'Plot 42, Sector 15, Electronic City, Bangalore - 560100';
  if (lower === 'propertytype') return '2 BHK Premium Apartment';
  if (lower === 'propertyname') return 'Green Valley Residency';
  if (lower === 'propertysize') return '1,250 sq.ft. (Super Built-up)';
  if (lower === 'configuration') return '2 Bedrooms, 2 Bathrooms, 1 Living Room, 1 Balcony, 1 Car Parking';
  if (lower === 'ownername' || lower === 'buildername' || lower === 'owneraddress') return 'Green Valley Developers Pvt. Ltd., 789, Construction House, Bangalore - 560078';
  if (lower === 'tenantname') return 'Rahul Sharma';
  if (lower === 'tenantaddress') return '123, Current Residence, Indiranagar, Bangalore - 560038';
  if (lower === 'tenantphone') return '+91 98765 43210';
  if (lower === 'tenantemail') return 'rahul.sharma@email.com';
  if (lower.includes('rentamount')) return '35,000';
  if (lower.includes('securitydeposit')) return '1,05,000';
  if (lower.includes('maintenancecharges')) return '3,500';
  if (lower.includes('lease')) return '11 months';
  if (lower.includes('latepenalty')) return '2% per month on overdue rent';
  if (lower.includes('utilityincluded')) return 'Water and maintenance charges included. Electricity and internet billed separately.';
  if (lower.includes('parkingdetails')) return '1 covered car parking space included';
  if (lower.includes('petpolicy')) return 'Pets allowed with refundable pet deposit of ₹10,000';
  if (lower.includes('specialclauses')) return '1. Tenant shall not sublet the premises.\n2. Minor repairs up to ₹2,000 per instance shall be borne by tenant.\n3. 60 days notice required for termination by either party.';

  // ─── Witness ───
  if (lower.includes('witnes')) return 'Rajesh Khanna';
  if (lower.includes('supervisorname')) return 'Ravi Deshmukh';
  if (lower.includes('supervisordesignation')) return 'Senior Project Manager';

  // ─── Manufacturing ───
  if (lower === 'productname') return 'Industrial Grade Bearing Assembly';
  if (lower === 'productcode') return 'BRG-2024-001';
  if (lower === 'quantity') return '500';
  if (lower === 'unit') return 'Pieces';
  if (lower.includes('priority')) return 'High';
  if (lower.includes('customername')) return 'AutoParts Manufacturing Ltd.';
  if (lower.includes('customerpo')) return 'MPL-2024-0042';
  if (lower.includes('batchnumber') || lower.includes('batchno')) return 'BATCH-2024-02-156';
  if (lower.includes('lotsize')) return '1,000';
  if (lower.includes('samplesize')) return '50';
  if (lower.includes('inspector')) return 'Quality Inspector - Ramesh Gupta';
  if (lower.includes('inspectionmethod')) return 'Visual Inspection, Dimensional Measurement, Load Testing';
  if (lower.includes('parameters')) return '| Parameter | Specification | Result | Status |\n|---|---|---|---|\n| Diameter | 45.00 ± 0.05 mm | 44.98 mm | ✅ Pass |\n| Hardness | HRC 58-62 | HRC 60 | ✅ Pass |\n| Surface Finish | Ra ≤ 0.8 μm | Ra 0.6 μm | ✅ Pass |\n| Load Capacity | ≥ 5,000 N | 5,200 N | ✅ Pass |';
  if (lower.includes('requestedby')) return 'Production Manager - Suresh Kumar';
  if (lower.includes('purpose')) return 'Monthly production requirement for Q1 2024';

  // ─── Certificates / Awards ───
  if (lower.includes('awardtitle')) return 'Outstanding Achievement Award 2024';
  if (lower.includes('recipientname')) return 'Rahul Sharma';
  if (lower.includes('recipientdesignation')) return 'Senior Software Engineer';
  if (lower.includes('awarddate')) return '15 January 2024';
  if (lower.includes('presentername')) return 'Arun Kumar (CEO)';
  if (lower.includes('presenterdesignation')) return 'Chief Executive Officer';
  if (lower.includes('achievementdescription')) return 'For exceptional contributions to the successful launch of the customer portal, demonstrating outstanding technical leadership, innovative problem-solving, and dedication to delivering high-quality results under tight deadlines.';
  if (lower.includes('trainingprogram')) return 'Advanced Cloud Architecture & DevOps';
  if (lower.includes('trainingprovider')) return 'AWS Training & Certification';
  if (lower.includes('trainingduration')) return '5 Days (40 Hours)';
  if (lower.includes('topicscovered')) return '• AWS Cloud Architecture Best Practices\n• Microservices Design Patterns\n• CI/CD Pipeline with AWS DevOps\n• Kubernetes Container Orchestration\n• Infrastructure as Code with Terraform';
  if (lower.includes('assessmentscore')) return '92%';
  if (lower.includes('grade')) return 'A+';
  if (lower.includes('trainername')) return 'John Mathews';
  if (lower.includes('trainerdesignation')) return 'Senior AWS Trainer';

  // ─── Letter body ───
  if (lower.includes('letterbody')) return 'This is to certify that the above-mentioned organization is a registered business entity operating in compliance with all applicable laws and regulations.\n\nThis letterhead is valid for all official correspondence and communication purposes.\n\nFor any inquiries, please contact our registered office during business hours.';
  if (lower.includes('executivesummary')) return 'This proposal outlines a comprehensive digital transformation strategy for TechSolutions India Ltd.';
  if (lower ===('instructions') || lower === 'instructions') return '1. Inspect all incoming materials for quality compliance\n2. Follow the standard operating procedures as per manual\n3. Report any deviations to the supervisor immediately\n4. Ensure proper documentation of all inspections';

  // ─── Default ───
  return `[${key}]`;
}
