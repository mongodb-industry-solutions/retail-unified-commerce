import React from 'react';

const features = [
  {
    title: "Unified Data Management",
    desc: "MongoDB's flexible schema allows seamless integration and real-time analysis of diverse data types—brand info, product catalogs, and promotional rules—enabling effortless boosting models within a unified commerce strategy."
  },
  {
    title: "Real-Time Event Processing",
    desc: "Atlas Change Streams and Triggers enable immediate application of brand boosting rules to search results, ensuring proactive and dynamic product visibility."
  },
  {
    title: "Scalable Search Integration",
    desc: "Native support for full-text and vector search lets you combine custom logic to prioritize and tag boosted products efficiently—no need for third-party search tools."
  },
  {
    title: "Dynamic Data Management",
    desc: "Brand amplifications can be created dynamically based on customer behavior, inventory levels, and channel engagement—enabling personalized, real-time amplification instead of relying on static campaigns."
  },
  {
    title: "High Performance at Scale",
    desc: "MongoDB's distributed architecture delivers high availability and speed, handling high transaction volumes and complex product data analysis without compromise."
  },
  {
    title: "Robust Enterprise Security",
    desc: "Strong authentication, authorization, and encryption features ensure sensitive business rules and product data are protected, with controlled access to the Admin portal."
  }
];

const BrandAmplificationWhyMDB = () => {
  return (
    <div style={{
      background: "linear-gradient(90deg, #f8fafc 0%, #e0f7fa 100%)",
      padding: "32px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
    }}>
      <h2 style={{ color: "#1a237e", marginBottom: 18 }}>Why MongoDB is Perfect for Brand Amplification</h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "24px",
        marginBottom: "24px"
      }}>
        {features.map((feature, idx) => (
          <div key={feature.title} style={{
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            padding: "20px",
            minHeight: "140px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center"
          }}>
            <h4 style={{ color: "#0288d1", marginBottom: 8 }}>{feature.title}</h4>
            <p style={{ fontSize: "1rem", color: "#333" }}>{feature.desc}</p>
          </div>
        ))}
      </div>
      <div style={{
        background: "#e3f2fd",
        borderRadius: "8px",
        padding: "18px",
        textAlign: "center",
        fontSize: "1.08rem",
        color: "#1565c0"
      }}>
        <strong>MongoDB Atlas</strong> empowers retailers to deliver dynamic, secure, and scalable brand amplification—making real-time product boosting and unified commerce a reality.
      </div>
    </div>
  );
};

export default BrandAmplificationWhyMDB;