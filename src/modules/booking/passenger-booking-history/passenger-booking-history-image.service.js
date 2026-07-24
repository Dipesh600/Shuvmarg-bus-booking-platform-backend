const createPassengerBookingHistoryImageService = (getPresignedUrl) => {
  return async (rawImages) => {
    const presignedImages = await Promise.all(
      rawImages.map((key) => getPresignedUrl(key))
    );
    return presignedImages.filter(Boolean);
  };
};

module.exports = {
  createPassengerBookingHistoryImageService,
};
