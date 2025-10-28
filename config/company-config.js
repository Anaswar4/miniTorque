const companyConfig = {
  // Company Information
  name: "miniTorque",
  tagline: "Premium Diecast Collection",
  
  // Contact Information
  address: {
    line1: "45 Trend Avenue",
    line2: "Elite Plaza",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    country: "India"
},
  contact: {
    phone: "+91 9444369444",
    email: "support@miniTorque.com",
    website: "www.miniTorque.com"
  },
  
  // Business Information
  business: {
    gst: "27AABCU9603R1ZX", // Sample GST number
    pan: "AABCU9603R",
    cin: "U74999MH2020PTC123456" // Sample CIN
  },
  
  // Invoice Settings
  invoice: {
    prefix: "INV",
    terms: [
      "All sales are final unless otherwise specified",
      "Returns accepted within 7 days of delivery for eligible items",
      "Damaged or defective items must be reported within 24 hours of delivery",
      "Free shipping available on orders above ₹500",
      "Refunds will be processed to the original payment method within 5-7 business days",
      "For any queries, please contact our customer support team"
    ],
    footer: "Thank you for choosing miniTorque - Your Premium  Diecast Car Collection!"
  },
  
  // Colors for PDF styling
  colors: {
    primary: "#000000",   
    secondary: "#666666",   
    accent: "#f8f9fa",     
    success: "#28a745",     
    danger: "#dc3545"   
  }
};

module.exports = companyConfig;