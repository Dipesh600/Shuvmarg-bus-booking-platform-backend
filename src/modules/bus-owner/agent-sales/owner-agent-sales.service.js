'use strict';

const createService = ({ errors, mapper, parse, repository }) => ({
  async listSales(ownerId, agentId, query) {
    if (!parse.isObjectId(agentId)) throw errors.notFound();
    const parsed = parse.parsePage(query);
    if (parsed.errors.length) throw errors.invalidInput(parsed.errors);
    const read = async (operation) => {
      try { return await operation(); } catch (error) {
        if (error.name === 'ValidationError') throw errors.invalidInput(
          Object.values(error.errors || {}).map((item) => item.message),
        );
        throw error;
      }
    };
    const brandIds = await read(() => repository.findOwnerBrandIds(ownerId, agentId));
    if (brandIds.length === 0) throw errors.notFound();
    const scope = { agentId, brandIds, ...parsed.value };
    return {
      statusCode: 200,
      responseBody: mapper.toSalesResponse({
        ...await read(() => repository.listSales(scope)), ...scope,
      }),
    };
  },
});

module.exports = { createService };
