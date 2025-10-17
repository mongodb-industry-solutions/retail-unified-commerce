import React from 'react';

const pillars = [
    {
        title: "Strategic Marketing",
        desc: "Targeted campaigns powered by unified data."
    },
    {
        title: "Consistent Messaging",
        desc: "Seamless touchpoints across digital and physical channels."
    },
    {
        title: "Compelling Experiences",
        desc: "Personalized, memorable interactions that deepen trust."
    }
];

const outcomes = [
    {
        title: "Stronger brand identity",
        desc: "Enable consistent, frictionless, and reliable experience across all platforms powered by a unified commerce approach."
    },
    {
        title: "Deeper customer relationships",
        desc: "Associates can understand the customer challenges based on Txn history."
    },
    {
        title: "Competitive differentiation",
        desc: "Using inventory automation can guarantee availability and delivery from unified inventory, meeting consumer demand."
    },
    {
        title: "Increased loyalty and customer acquisition",
        desc: "Mobile POS systems empower retailers to instantly process returns or apply discounts, enhancing the customer experience."
    }
];

const BrandAmplificationBusinessValue = () => {
    return (
        <div style={{
            background: "linear-gradient(90deg, #f8fafc 0%, #e0f7fa 100%)",
            padding: "32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
        }}>
            <h2 style={{ color: "#1a237e", marginBottom: 12 }}>Brand Amplification: Business Value for Retailers</h2>
            <p style={{ fontSize: "1.1rem", marginBottom: 18 }}>
                <strong>Product visibility</strong> can be optimized through search and recommendation features that highlight relevant products at opportune moments.
            </p>
            <p style={{ fontSize: "1.1rem", marginBottom: 18 }}>
                <strong>Brand Amplification</strong> is the strategy of increasing visibility, engagement, and emotional connection for selected brands.
                <br />
                <span style={{ color: "#00796b" }}>
                    <strong>Dynamic Brand Amplification</strong> refers to the ability to adjust campaigns, promotions, and product visibility in real time based on customer behavior, inventory levels, and channel engagement—rather than relying on static campaigns.
                </span>
            </p>
            <div style={{
                display: "flex",
                gap: "24px",
                justifyContent: "center",
                margin: "32px 0"
            }}>
                {pillars.map((pillar, idx) => (
                    <div key={pillar.title} style={{
                        background: "#fff",
                        borderRadius: "12px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                        padding: "20px",
                        minWidth: 220,
                        textAlign: "center",
                        flex: 1
                    }}>
                        <h4 style={{ color: "#0288d1", marginBottom: 8 }}>{pillar.title}</h4>
                        <p style={{ fontSize: "1rem", color: "#333" }}>{pillar.desc}</p>
                    </div>
                ))}
            </div>
            <h3 style={{ color: "#1565c0", marginBottom: 12, marginTop: 32 }}>Outcomes of Effective Amplification</h3>
            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "18px",
                marginBottom: "24px"
            }}>
                {outcomes.map(outcome => (
                    <div key={outcome.title} style={{
                        background: "#fff",
                        borderRadius: "10px",
                        boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
                        padding: "16px",
                        fontSize: "1rem"
                    }}>
                        <strong style={{ color: "#0288d1" }}>{outcome.title}</strong>
                        <div style={{ color: "#333", marginTop: 6 }}>{outcome.desc}</div>
                    </div>
                ))}
            </div>
            <div style={{
                background: "#e3f2fd",
                borderRadius: "8px",
                padding: "18px",
                textAlign: "center",
                fontSize: "1.08rem",
                color: "#1565c0",
                marginBottom: "18px"
            }}>
                <div style={{
                    background: "#e3f2fd",
                    borderRadius: "8px",
                    padding: "24px",
                    textAlign: "left",
                    fontSize: "1.08rem",
                    color: "#1565c0",
                    marginBottom: "18px"
                }}>
                    <h3 style={{ color: "#1565c0", marginBottom: "12px" }}>Who Benefits from Brand Amplification?</h3>
                    <ul style={{ paddingLeft: "1.2em", marginBottom: 0 }}>
                        <li>
                            <strong>Retailers:</strong> Drive revenue growth, stand out in the market, and optimize operations with unified, real-time data powering dynamic campaigns and seamless omnichannel experiences.
                        </li>
                        <li>
                            <strong>Customers:</strong> Enjoy personalized recommendations, real-time product visibility, and empowered service from associates, leading to smoother, more satisfying shopping journeys.
                        </li>
                        <li>
                            <strong>Store Associates:</strong> Gain actionable insights and efficient tools (like mobile POS) to deliver tailored solutions, streamline processes, and boost sales through data-driven product promotion.
                        </li>
                        <li>
                            <strong>Brands & Manufacturers:</strong> Achieve greater visibility and sales through strategic placements, dynamic campaigns, and collaborative marketing with retailers.
                        </li>
                        <li>
                            <strong>Retail IT Teams:</strong> Modernize infrastructure, simplify integration and maintenance, and unlock real-time insights with MongoDB’s unified data platform and advanced features.
                        </li>
                    </ul>
                </div>
            </div>
            <div style={{
                background: "#fffde7",
                borderRadius: "8px",
                padding: "18px",
                textAlign: "center",
                fontSize: "1.08rem",
                color: "#f57c00"
            }}>
                <strong>MongoDB makes these outcomes possible at scale.</strong><br />
                By unifying data from every channel, it ensures personalization and campaign execution are consistent, measurable, and adaptable—turning customer journeys into revenue opportunities.
            </div>
        </div>
    );
};

export default BrandAmplificationBusinessValue;