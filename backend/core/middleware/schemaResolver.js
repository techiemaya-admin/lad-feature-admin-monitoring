const { getSchema } = require('../utils/schemaHelper');

function schemaResolver(req, res, next) {
    try {
        // Populate req.schema using the LAD schemaHelper function
        req.schema = getSchema(req);
        // Legacy support requirement: The schema must not fallback to 'public' implicitly without warning if LAD is strict.
        // The imported helper uses the standard logic.
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { schemaResolver };
