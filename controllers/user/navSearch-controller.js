const Product = require('../../models/product-schema');
const searchProduct = async (req,res)=>{
    try {
        const query = req.query.q || '';
        if (query.length < 2) return res.json([]);

        const products = await Product.aggregate([
         
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            
            {
                $match: {
                    $or: [
                        { productName: { $regex: query, $options: 'i' } },
                        { 'category.name': { $regex: `^${query}`, $options: 'i' } }  
                    ],
                    isListed: true,
                    isDeleted: false,
                    isBlocked: false,
                    'category.isListed': true,
                    'category.isDeleted': false
                }
            },
            { $limit: 10 },
            { $project: { _id: 1, productName: 1, brand: 1, mainImage: 1 } }
        ]);

        res.json(products);
        
    }catch(error){
        console.log(' navbar search error:', error);
        res.status(500).json({error:'Server error'})
    }
};


module.exports={searchProduct}