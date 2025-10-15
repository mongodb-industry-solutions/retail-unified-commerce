import React from 'react';
import Icon from '@leafygreen-ui/icon';
import Badge from '@leafygreen-ui/badge';

const BrandAmplificationHowToDemo = () => {
    return (
        <div style={{
            background: "linear-gradient(90deg, #f8fafc 0%, #e0f7fa 100%)",
            padding: "32px",
        }}>
            <h2 style={{ color: "#1a237e", marginBottom: 18 }}>How to Demo Brand Amplification</h2>
            <div style={{
                background: "#fff",
                borderRadius: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                padding: "20px",
                marginBottom: "24px"
            }}>
                <h3 style={{ color: "#0288d1", marginBottom: 8 }}>🔍 What to Highlight on This Page</h3>
                <ul style={{ paddingLeft: "1.2em", fontSize: "1.08rem" }}>
                    <li>
                        Authorized users (e.g., Marketing managers, Store Managers) can mark specific brands as more relevant, amplifying that brand within search results.
                    </li>
                    <li>
                        MongoDB stores the new <i>Brand Amplification</i> rule, associating it with the chosen brand. This data resides within existing collections, leveraging MongoDB's flexible schema.
                    </li>
                    <li>
                        Store associates searching for products (e.g., "running shoes") in the Product Inventory module will see boosted brands tagged as <Badge className={'mt-2'} variant="green">Store's Favorite</Badge>, making it easier to recommend strategically important products.
                    </li>
                </ul>
            </div>
            <div style={{
                background: "#e3f2fd",
                borderRadius: "8px",
                padding: "20px",
                marginBottom: "24px"
            }}>
                <h3 style={{ color: "#1565c0", marginBottom: 8 }}>👣 Steps to Demo This Page</h3>
                <ol style={{ paddingLeft: "1.2em", fontSize: "1.08rem" }}>
                    <li>
                        Inside the <strong>“Test brand amplifications”</strong> tab, search for any product (e.g., <em>“Chips”</em>). Two result columns will appear: the left applies Brand Amplifications, the right does not.
                        <div style={{
                            background: "#f5f5f5",
                            borderRadius: "6px",
                            padding: "10px",
                            margin: "10px 0",
                            textAlign: "center",
                            color: "#888"
                        }}>
                            <img src="/images/talkTrack/ba-step1.png" alt="Results comparison" style={{ maxWidth: "100%", maxHeight: "600px" }} />
                        </div>
                    </li>
                    <li>
                        Scroll to a product you wish to amplify and click the <Icon glyph="Tag" /> icon to create a brand amplification. You will be moved to the <strong>“Create Brand Amplification”</strong> tab, with the form auto-populated with the brand and category of the selected product.
                        <div style={{
                            background: "#f5f5f5",
                            borderRadius: "6px",
                            padding: "10px",
                            margin: "10px 0",
                            textAlign: "center",
                            color: "#888"
                        }}>
                            <img src="/images/talkTrack/ba-step2.png" alt="Brand Amplification form" style={{ maxWidth: "100%", maxHeight: "600px" }} />
                        </div>
                    </li>
                    <li>
                        Click <strong>“Create”</strong> to add the new Brand Amplification entry. You’ll be redirected to the <strong>“Active brand amplification”</strong> tab, where your new entry appears at the bottom of the list.
                        <div style={{
                            background: "#f5f5f5",
                            borderRadius: "6px",
                            padding: "10px",
                            margin: "10px 0",
                            textAlign: "center",
                            color: "#888"
                        }}>
                            <img src="/images/talkTrack/ba-step3.png" alt="Brand Amplification list" style={{ maxWidth: "100%", maxHeight: "600px" }} />
                        </div>
                    </li>
                    <li>
                        Return to the <strong>“Test brand amplifications”</strong> tab and repeat your search. Now, results highlight the brand and category from your Brand Amplification, increasing visibility and driving sales for targeted products.
                        <div style={{
                            background: "#f5f5f5",
                            borderRadius: "6px",
                            padding: "10px",
                            margin: "10px 0",
                            textAlign: "center",
                            color: "#888"
                        }}>
                            <img src="/images/talkTrack/ba-step4.png" alt="Highlighted results" style={{ maxWidth: "100%", maxHeight: "600px" }} />
                        </div>
                    </li>
                </ol>
            </div>
            <div style={{
                background: "#fffde7",
                borderRadius: "8px",
                padding: "20px",
                marginBottom: "24px"
            }}>
                <h3 style={{ color: "#f57c00", marginBottom: 8 }}>📘 Extra Notes</h3>
                <ul style={{ paddingLeft: "1.2em", fontSize: "1.08rem" }}>
                    <li>
                        Feel free to modify the form (categories, brand, etc.) to see how <code>$searchMeta</code> information and the dynamic document change.
                        <div style={{
                            background: "#f5f5f5",
                            borderRadius: "6px",
                            padding: "10px",
                            margin: "10px 0",
                            textAlign: "center",
                            color: "#888"
                        }}>
                            <img src="/images/talkTrack/ba-step5.png" alt="Search meta and document" style={{ maxWidth: "100%", maxHeight: "600px" }} />
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default BrandAmplificationHowToDemo;