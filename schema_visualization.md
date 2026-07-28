# Database Schema Visualization

Below is the generated class diagram representing the MongoDB Mongoose schemas from `buss-booking-system-backend`.

```mermaid
classDiagram
  class AdminAuditLog {
    +ObjectId (SuperAdmin) adminId
    +String action
    +String targetType
    +ObjectId targetId
    +String reason
    +Mixed metadata
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  AdminAuditLog --> SuperAdmin : adminId
  class Admin {
    +String adminId
    +String email
    +String password
    +String role
    +Boolean twoFactorEnabled
    +String twoFactorType
    +String twoFactorSecret
    +String phoneNumber
    +Boolean biometricEnabled
    +String biometricPublicKey
    +Date lastLoginAt
    +Number loginAttempts
    +Boolean accountLocked
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  class SuperAdmin {
    +String adminId
    +String email
    +String password
    +String role
    +Boolean twoFactorEnabled
    +String twoFactorType
    +String twoFactorSecret
    +String phoneNumber
    +Boolean biometricEnabled
    +String biometricPublicKey
    +Date lastLoginAt
    +Number loginAttempts
    +Boolean accountLocked
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  class Agent {
    +String agentId
    +ObjectId (User) user
    +Array[String] citizenshipCertificate.documentUrls
    +Boolean citizenshipCertificate.verified
    +ObjectId (Superadmin) citizenshipCertificate.verifiedBy
    +Date citizenshipCertificate.verifiedAt
    +String citizenshipCertificate.rejectionReason
    +Array[String] agentAgreement.documentUrls
    +String agentAgreement.digitalSignature
    +Boolean agentAgreement.verified
    +String agentAgreement.rejectionReason
    +String bankAccount.bankName
    +String bankAccount.accountHolderName
    +String bankAccount.accountNumber
    +Boolean bankAccount.verified
    +String bankAccount.verificationReferenceId
    +Array[String] bankAccount.documentUrls
    +String bankAccount.rejectionReason
    +String addressProof.documentType
    +Array[String] addressProof.documentUrls
    +Boolean addressProof.verified
    +String addressProof.rejectionReason
    +String verificationStatus
    +String rejectionReason
    +Number riskScore
    +ObjectId (User) approvedBy
    +Date approvedAt
    +String agentCompanyName
    +Array[String] operatingAreas
    +Number commissionRate
    +Number totalBookings
    +Number totalRevenue
    +Number totalCommissionEarned
    +Number walletBalance
    +Number deductions
    +Array trainings
    +String accountStatus
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Agent --> User : user
  Agent --> Superadmin : citizenshipCertificate.verifiedBy
  Agent --> User : approvedBy
  class AutoSeat {
    +String busNo
    +String busType
    +Number totalSeats
    +Number seatsPerRow
    +Array seata
    +Array seatb
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  class BoardingPoints {
    +ObjectId (Stop) stopId
    +String city
    +String pointName
    +String landmark
    +Number coordinates.lat
    +Number coordinates.lng
    +String contactNumber
    +String type
    +Boolean isGlobal
    +ObjectId (User) ownerId
    +Boolean status
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  BoardingPoints --> Stop : stopId
  BoardingPoints --> User : ownerId
  class Booking {
    +ObjectId (User) userId
    +ObjectId (Trip) tripId
    +ObjectId (OperatorBrand) brandId
    +ObjectId (Buse) busId
    +String bookedFrom
    +String bookedTo
    +String bookedDepartureTime
    +String bookedArrivalTime
    +Array[String] seats
    +Array passengerDetails
    +String boardingPoint.name
    +String boardingPoint.time
    +Number boardingPoint.lat
    +Number boardingPoint.lng
    +String droppingPoint.name
    +String droppingPoint.time
    +Number droppingPoint.lat
    +Number droppingPoint.lng
    +Boolean boardingConfirmed
    +Date boardingConfirmedAt
    +ObjectId (User) boardingConfirmedBy
    +Number originalAmount
    +ObjectId (Coupon) couponUsed
    +String couponCode
    +Number discountAmount
    +Number smMoneyUsed
    +Number gatewayAmount
    +Number gatewayFeeRate
    +ObjectId (SMLedger) smDebitEntryId
    +Number totalAmount
    +String paymentMethod
    +String transactionId
    +String bookedVia
    +Date bookedAt
    +String status
    +String ticketId
    +String cancellationReason
    +Date cancellationRequestedAt
    +String cancelledBy
    +ObjectId (Refund) refundId
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Booking --> User : userId
  Booking --> Trip : tripId
  Booking --> OperatorBrand : brandId
  Booking --> Buse : busId
  Booking --> User : boardingConfirmedBy
  Booking --> Coupon : couponUsed
  Booking --> SMLedger : smDebitEntryId
  Booking --> Refund : refundId
  class BusAmenities {
    +String name
    +String description
    +String icon
    +String type
    +ObjectId (User) ownerId
    +Boolean status
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  BusAmenities --> User : ownerId
  class BusOwner {
    +String busOwnerId
    +ObjectId (User) user
    +String companyName
    +Array[String] companyRegistration.documentUrls
    +Boolean companyRegistration.verified
    +String companyRegistration.rejectionReason
    +Array[String] ownerIdentity.documentUrls
    +Boolean ownerIdentity.verified
    +String ownerIdentity.rejectionReason
    +String taxRegistration.panNumber
    +String taxRegistration.vatNumber
    +String taxRegistration.registrationNumber
    +Array[String] taxRegistration.documentUrls
    +Boolean taxRegistration.verified
    +String taxRegistration.rejectionReason
    +String transportLicense.licenseNumber
    +Date transportLicense.validTill
    +Array[String] transportLicense.documentUrls
    +Boolean transportLicense.verified
    +String transportLicense.rejectionReason
    +Array insuranceCertificates
    +String bankDetails.bankName
    +String bankDetails.accountNumber
    +String bankDetails.accountHolderName
    +String bankDetails.branchName
    +String bankDetails.swiftCode
    +Array[String] bankDetails.documentUrls
    +String verificationStatus
    +String rejectionReason
    +ObjectId (Admin) approvedBy
    +Date approvedAt
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  BusOwner --> User : user
  BusOwner --> Admin : approvedBy
  class BusRoute {
    +String routeName
    +String via
    +String from
    +String to
    +ObjectId (User) ownerId
    +ObjectId (BusRoute) returnRouteId
    +String type
    +String status
    +Number distanceKm
    +Number durationMinutes
    +Array stoppages
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  BusRoute --> User : ownerId
  BusRoute --> BusRoute : returnRouteId
  class busschedules {
    +ObjectId (Buse) busId
    +ObjectId (Route) routeId
    +ObjectId (BusRoute) busRouteId
    +ObjectId (Seat) seatId
    +String departureTime
    +String arrivalTime
    +String date
    +Number yatrapoints
    +String totalTimeTaken
    +String shift
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  busschedules --> Buse : busId
  busschedules --> Route : routeId
  busschedules --> BusRoute : busRouteId
  busschedules --> Seat : seatId
  class ConductorProfile {
    +ObjectId (OperatorBrand) brandId
    +ObjectId (User) ownerId
    +ObjectId (User) userId
    +String fullName
    +String phone
    +String status
    +ObjectId (User) assignedBy
    +String notes
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  ConductorProfile --> OperatorBrand : brandId
  ConductorProfile --> User : ownerId
  ConductorProfile --> User : userId
  ConductorProfile --> User : assignedBy
  class Coupon {
    +String couponCode
    +String title
    +String description
    +String discountType
    +Number discountValue
    +Number minOrderAmount
    +Number maxDiscountAmount
    +Date validFrom
    +Date validTo
    +Number totalUsageLimit
    +Number perUserLimit
    +Number usedCount
    +Boolean isActive
    +Array[ObjectId] applicableRoutes
    +Array[ObjectId] excludedRoutes
    +Array[String] applicableUserTypes
    +ObjectId (User) createdBy
    +ObjectId (User) lastModifiedBy
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Coupon --> busschedules : applicableRoutes
  Coupon --> busschedules : excludedRoutes
  Coupon --> User : createdBy
  Coupon --> User : lastModifiedBy
  class CouponUsage {
    +ObjectId (User) userId
    +ObjectId (Coupon) couponId
    +String couponCode
    +ObjectId (Booking) bookingId
    +Number originalAmount
    +Number discountAmount
    +Number finalAmount
    +String discountType
    +Number discountValue
    +Date usageDate
    +String status
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  CouponUsage --> User : userId
  CouponUsage --> Coupon : couponId
  CouponUsage --> Booking : bookingId
  class DriverProfile {
    +ObjectId (OperatorBrand) brandId
    +ObjectId (User) ownerId
    +ObjectId (User) userId
    +String fullName
    +String phone
    +String email
    +String photo
    +String address
    +String gender
    +String licenseNumber
    +String licenseType
    +Date licenseExpiry
    +String licenseDoc
    +Date medicalCertExpiry
    +String medicalCertDoc
    +Number experienceYears
    +String previousEmployer
    +ObjectId (Buse) assignedBusId
    +String status
    +String documents.license.url
    +Date documents.license.validTill
    +String documents.medical.url
    +Date documents.medical.validTill
    +String documents.policeReport.url
    +Date documents.policeReport.validTill
    +String approvalStatus
    +ObjectId (SuperAdmin) approvedBy
    +Date approvedAt
    +ObjectId (SuperAdmin) rejectedBy
    +Date rejectedAt
    +String rejectionReason
    +String createdBy
    +String notes
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  DriverProfile --> OperatorBrand : brandId
  DriverProfile --> User : ownerId
  DriverProfile --> User : userId
  DriverProfile --> Buse : assignedBusId
  DriverProfile --> SuperAdmin : approvedBy
  DriverProfile --> SuperAdmin : rejectedBy
  class FareRule {
    +ObjectId (Buse) fleetId
    +ObjectId (BusRoute) routeId
    +ObjectId (User) ownerId
    +Number baseFare
    +Number seatClassPremium.window
    +Number seatClassPremium.aisle
    +Number seatClassPremium.sleeper
    +Boolean advanceDiscount.enabled
    +Number advanceDiscount.daysBeforeTravel
    +Number advanceDiscount.discountPercent
    +Boolean peakPricing.enabled
    +Array[String] peakPricing.peakDates
    +Number peakPricing.surchargePercent
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  FareRule --> Buse : fleetId
  FareRule --> BusRoute : routeId
  FareRule --> User : ownerId
  class Buse {
    +String fleetId
    +ObjectId (User) ownerId
    +ObjectId (OperatorBrand) brandId
    +Boolean setupComplete
    +ObjectId (Buse) fleetGroupId
    +String busName
    +String busNumber
    +String busType
    +String vehicleType
    +Number totalSeats
    +String seatConfig.busShape
    +Array seatConfig.floors
    +ObjectId (BusAmenities) amenitiesId
    +Array[ObjectId] amenityIds
    +ObjectId (BoardingPoints) boardingPointId
    +ObjectId (RouteCorridor) corridorId
    +ObjectId (RouteRequest) routeRequestId
    +Array[String] fleetImages
    +Number averageRating
    +Number totalReviews
    +String fleetDocuments.fitnessCert.url
    +Date fleetDocuments.fitnessCert.validTill
    +String fleetDocuments.insurance.url
    +String fleetDocuments.insurance.policyNumber
    +Date fleetDocuments.insurance.validTill
    +String fleetDocuments.bluebook.url
    +String fleetDocuments.routePermit.url
    +Date fleetDocuments.routePermit.validTill
    +Number registrationYear
    +String status
    +String approvalStatus
    +ObjectId (SuperAdmin) approvedBy
    +Date approvedAt
    +ObjectId (SuperAdmin) rejectedBy
    +Date rejectedAt
    +String rejectionReason
    +String documentReviews.fleetImages.status
    +String documentReviews.fleetImages.reason
    +String documentReviews.fitnessCert.status
    +String documentReviews.fitnessCert.reason
    +String documentReviews.insurance.status
    +String documentReviews.insurance.reason
    +String documentReviews.bluebook.status
    +String documentReviews.bluebook.reason
    +String documentReviews.routePermit.status
    +String documentReviews.routePermit.reason
    +String createdBy
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Buse --> User : ownerId
  Buse --> OperatorBrand : brandId
  Buse --> Buse : fleetGroupId
  Buse --> BusAmenities : amenitiesId
  Buse --> BusAmenities : amenityIds
  Buse --> BoardingPoints : boardingPointId
  Buse --> RouteCorridor : corridorId
  Buse --> RouteRequest : routeRequestId
  Buse --> SuperAdmin : approvedBy
  Buse --> SuperAdmin : rejectedBy
  class Route {
    +String name
    +ObjectId (User) createdBy
    +Array polyline
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Route --> User : createdBy
  class Notification {
    +ObjectId (User) user
    +String type
    +String title
    +String message
    +Boolean isRead
    +Mixed meta
    +Date createdAt
    +ObjectId _id
  }

  Notification --> User : user
  class OperatorBrand {
    +String brandCode
    +ObjectId (User) ownerId
    +String brandName
    +String logo
    +String contactEmail
    +String contactPhone
    +String baseCity
    +Number commissionRate
    +String bankDetails.accountHolderName
    +String bankDetails.bankName
    +String bankDetails.accountNumber
    +String bankDetails.ifscOrSwift
    +String status
    +String kycStatus
    +ObjectId (SuperAdmin) approvedBy
    +Date approvedAt
    +ObjectId (SuperAdmin) suspendedBy
    +String suspendedReason
    +String notes
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  OperatorBrand --> User : ownerId
  OperatorBrand --> SuperAdmin : approvedBy
  OperatorBrand --> SuperAdmin : suspendedBy
  class OperatorRouteConfig {
    +ObjectId (OperatorBrand) brandId
    +ObjectId (RouteVariant) variantId
    +String patternName
    +Boolean isDefault
    +Array[ObjectId] activeStops
    +Array boardingConfig
    +Array timingConfig
    +Array[ObjectId] returnActiveStops
    +Array returnBoardingConfig
    +Array returnTimingConfig
    +Boolean returnOverridden
    +Number minimumJourneyMinutes
    +String status
    +String notes
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  OperatorRouteConfig --> OperatorBrand : brandId
  OperatorRouteConfig --> RouteVariant : variantId
  OperatorRouteConfig --> Stop : activeStops
  OperatorRouteConfig --> Stop : returnActiveStops
  class OTP {
    +String phone
    +String otp
    +String purpose
    +Date otpExpiry
    +Boolean isUsed
    +Number attempts
    +Number maxAttempts
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  class PlatformConfig {
    +String key
    +Mixed value
    +String description
    +ObjectId (SuperAdmin) updatedBy
    +String note
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  PlatformConfig --> SuperAdmin : updatedBy
  class ReferralHistory {
    +ObjectId (User) referredUserId
    +ObjectId (User) referrerUserId
    +Number referredUserPoints
    +Number referrerPoints
    +String usedReferralCode
    +String status
    +String rewardType
    +String metadata.ipAddress
    +String metadata.deviceInfo
    +String metadata.campaign
    +Date expiresAt
    +String notes
    +Boolean pointsCredited
    +String referredUserTransactionId
    +String referrerTransactionId
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  ReferralHistory --> User : referredUserId
  ReferralHistory --> User : referrerUserId
  class ReferralV2 {
    +ObjectId (User) referrerId
    +ObjectId (User) referredUserId
    +String referralCode
    +String status
    +Number journeysCompleted
    +Number totalUnlocked
    +Number lockedRemaining
    +Date expiresAt
    +Boolean flaggedForReview
    +String flagReason
    +Array unlockHistory
    +ObjectId (SMLedger) lockedLedgerEntryId
    +ObjectId (User) voidedBy
    +Date voidedAt
    +String voidReason
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  ReferralV2 --> User : referrerId
  ReferralV2 --> User : referredUserId
  ReferralV2 --> SMLedger : lockedLedgerEntryId
  ReferralV2 --> User : voidedBy
  class RefreshToken {
    +ObjectId (User) userId
    +String tokenHash
    +Date expiresAt
    +String deviceInfo
    +String ipAddress
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  RefreshToken --> User : userId
  class RefundDetails {
    +ObjectId (User) userId
    +String label
    +String accountType
    +String accountName
    +String accountNumber
    +String bankName
    +String bankBranch
    +Boolean isDefault
    +String status
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  RefundDetails --> User : userId
  class Refund {
    +ObjectId (User) userId
    +ObjectId (Booking) bookingId
    +ObjectId (Transaction) transactionId
    +Number originalAmount
    +Number cancellationCharge
    +Number refundAmount
    +String status
    +Date requestedAt
    +Date processedAt
    +Date completedAt
    +String reason
    +String remarks
    +String refundProof
    +ObjectId (User) processedBy
    +String refundGateway
    +String refundGatewayId
    +Mixed refundGatewayResponse
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Refund --> User : userId
  Refund --> Booking : bookingId
  Refund --> Transaction : transactionId
  Refund --> User : processedBy
  class RefundPolicy {
    +String policyName
    +Number refundPercentage
    +Number deductionPercentage
    +String description
    +Number minHours
    +Number maxHours
    +String color
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  class Review {
    +ObjectId (User) userId
    +ObjectId (Booking) bookingId
    +ObjectId (Buse) fleetId
    +ObjectId (Trip) tripId
    +Number rating
    +String title
    +String comment
    +Array[String] images
    +Boolean isAnonymous
    +Boolean reported
    +Number helpfulCount
    +Mixed meta
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Review --> User : userId
  Review --> Booking : bookingId
  Review --> Buse : fleetId
  Review --> Trip : tripId
  class RouteCorridor {
    +String code
    +ObjectId (Stop) originId
    +ObjectId (Stop) destinationId
    +Boolean isSymmetric
    +String status
    +ObjectId (Admin) createdBy
    +String notes
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  RouteCorridor --> Stop : originId
  RouteCorridor --> Stop : destinationId
  RouteCorridor --> Admin : createdBy
  class RouteRequest {
    +ObjectId (User) ownerId
    +ObjectId (OperatorBrand) brandId
    +ObjectId (Buse) fleetId
    +String originCity
    +String destinationCity
    +Array[String] viaStops
    +String status
    +String adminNotes
    +String rejectionReason
    +Date resolvedAt
    +ObjectId (SuperAdmin) resolvedBy
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  RouteRequest --> User : ownerId
  RouteRequest --> OperatorBrand : brandId
  RouteRequest --> Buse : fleetId
  RouteRequest --> SuperAdmin : resolvedBy
  class RouteStop {
    +ObjectId (RouteVariant) variantId
    +ObjectId (Stop) stopId
    +Number sequence
    +Boolean isMajor
    +Number estimatedMinutesFromOrigin
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  RouteStop --> RouteVariant : variantId
  RouteStop --> Stop : stopId
  class RouteVariant {
    +String code
    +ObjectId (RouteCorridor) corridorId
    +String name
    +String type
    +String direction
    +ObjectId (RouteVariant) returnVariantId
    +Number distanceKm
    +Number durationMinutes
    +String status
    +ObjectId (Admin) createdBy
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  RouteVariant --> RouteCorridor : corridorId
  RouteVariant --> RouteVariant : returnVariantId
  RouteVariant --> Admin : createdBy
  class Schedule {
    +ObjectId (OperatorBrand) brandId
    +ObjectId (User) ownerId
    +ObjectId (Buse) busId
    +ObjectId (RouteVariant) variantId
    +ObjectId (OperatorRouteConfig) operatorRouteConfigId
    +ObjectId (DriverProfile) driverId
    +ObjectId (SeatTemplate) seatTemplateId
    +String departureTime
    +String arrivalTime
    +String shift
    +String recurrence
    +Array[Number] daysOfWeek
    +Date effectiveFrom
    +Date effectiveUntil
    +Number fareOverride
    +String status
    +String createdBy
    +ObjectId (Admin) activatedBy
    +Date activatedAt
    +ObjectId (Admin) suspendedBy
    +Date suspendedAt
    +String suspensionReason
    +Date suspendUntil
    +ObjectId (Admin) resumedBy
    +Date resumedAt
    +String notes
    +Number advanceGenerationDays
    +Number advanceBookingDays
    +Number bookingCutoffHours
    +ObjectId (Schedule) returnScheduleId
    +Number versionNumber
    +ObjectId (Schedule) parentScheduleId
    +ObjectId (Schedule) pendingVersionId
    +String operationalModel
    +Number layoverMinutes
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Schedule --> OperatorBrand : brandId
  Schedule --> User : ownerId
  Schedule --> Buse : busId
  Schedule --> RouteVariant : variantId
  Schedule --> OperatorRouteConfig : operatorRouteConfigId
  Schedule --> DriverProfile : driverId
  Schedule --> SeatTemplate : seatTemplateId
  Schedule --> Admin : activatedBy
  Schedule --> Admin : suspendedBy
  Schedule --> Admin : resumedBy
  Schedule --> Schedule : returnScheduleId
  Schedule --> Schedule : parentScheduleId
  Schedule --> Schedule : pendingVersionId
  class ScratchCard {
    +ObjectId (User) userId
    +ObjectId (Booking) bookingId
    +Number amount
    +String status
    +Date scratchedAt
    +ObjectId (SMLedger) ledgerEntryId
    +Date expiresAt
    +String themeName
    +String imageUrl
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  ScratchCard --> User : userId
  ScratchCard --> Booking : bookingId
  ScratchCard --> SMLedger : ledgerEntryId
  class SeatHold {
    +ObjectId (Trip) tripId
    +ObjectId (User) userId
    +Array[String] seatNumbers
    +String tempBookingId
    +String status
    +Date expiresAt
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  SeatHold --> Trip : tripId
  SeatHold --> User : userId
  class SeatTemplate {
    +String templateName
    +Number totalSeats
    +String seatConfig.busShape
    +String seatConfig.layoutVariant
    +Boolean seatConfig.hasKaKha
    +Number seatConfig.totalColumns
    +Array seatConfig.floors
    +Array seata
    +Array seatb
    +Array seatc
    +ObjectId (User) userId
    +ObjectId (SuperAdmin) createdById
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  SeatTemplate --> User : userId
  SeatTemplate --> SuperAdmin : createdById
  class Seat {
    +ObjectId (Trip) tripId
    +Array seata
    +Array seatb
    +Array seatc
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Seat --> Trip : tripId
  class Settlement {
    +ObjectId (User) ownerId
    +ObjectId (OperatorBrand) brandId
    +Array[ObjectId] tripIds
    +Number totalTicketsSold
    +Number grossAmount
    +Number platformCommission
    +Number commissionRate
    +Number netPayableAmount
    +String status
    +String raisedBy
    +Date raisedAt
    +String paymentProof
    +String paymentMethod
    +Date paidAt
    +ObjectId (SuperAdmin) paidBy
    +Date receivedAt
    +ObjectId (User) receivedConfirmedBy
    +String remarks
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Settlement --> User : ownerId
  Settlement --> OperatorBrand : brandId
  Settlement --> Trip : tripIds
  Settlement --> SuperAdmin : paidBy
  Settlement --> User : receivedConfirmedBy
  class SMLedger {
    +ObjectId (User) userId
    +ObjectId (Booking) bookingId
    +ObjectId (ReferralV2) referralId
    +ObjectId (SMLedger) relatedLedgerEntryId
    +String type
    +String direction
    +Number amount
    +String status
    +Number bookingNumber
    +Date expires_at
    +Array consumedBy
    +Number remainingAmount
    +String note
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  SMLedger --> User : userId
  SMLedger --> Booking : bookingId
  SMLedger --> ReferralV2 : referralId
  SMLedger --> SMLedger : relatedLedgerEntryId
  class Stop {
    +String code
    +String name
    +String type
    +String state
    +Array[String] aliases
    +Number coordinates.lat
    +Number coordinates.lng
    +String status
    +ObjectId (Admin) createdBy
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Stop --> Admin : createdBy
  class Transaction {
    +ObjectId (User) userId
    +ObjectId (Booking) bookingId
    +String ticketId
    +ObjectId (Trip) tripId
    +Array[String] seats
    +String transactionType
    +String gateway
    +String paymentMethod
    +String transactionId
    +Number originalAmount
    +Number totalAmount
    +String currency
    +String status
    +Date paidAt
    +String failureReason
    +String disputeReason
    +String proofAttachmentKey
    +String refundStatus
    +String refundNote
    +Date resolvedAt
    +ObjectId (SuperAdmin) resolvedBy
    +Mixed meta
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Transaction --> User : userId
  Transaction --> Booking : bookingId
  Transaction --> Trip : tripId
  Transaction --> SuperAdmin : resolvedBy
  class Trip {
    +String tripId
    +ObjectId (Buse) busId
    +ObjectId (BusRoute) routeId
    +ObjectId (RouteVariant) variantId
    +ObjectId (User) ownerId
    +ObjectId (OperatorBrand) brandId
    +ObjectId (DriverProfile) driverId
    +Array driverAssignmentLog
    +Date tripDate
    +String departureTime
    +Date actualDepartureTime
    +String arrivalTime
    +Date actualArrivalTime
    +Number tripFare
    +Date bookingClosesAt
    +ObjectId (SeatTemplate) seatTemplateId
    +ObjectId (Schedule) scheduleId
    +String directionLabel
    +String fromStopName
    +String toStopName
    +Boolean isAutoGenerated
    +String templateId
    +ObjectId (Trip) returnTripLinked
    +String status
    +ObjectId (User) cancelledBy
    +String cancellationReason
    +Date cancelledAt
    +String exceptionType
    +String originalDepartureTime
    +String originalArrivalTime
    +String rescheduleReason
    +ObjectId (User) rescheduledBy
    +Date rescheduledAt
    +String recurrence
    +String shift
    +Array[Number] daysOfWeek
    +Date autoGenerateUntil
    +Boolean isActive
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Trip --> Buse : busId
  Trip --> BusRoute : routeId
  Trip --> RouteVariant : variantId
  Trip --> User : ownerId
  Trip --> OperatorBrand : brandId
  Trip --> DriverProfile : driverId
  Trip --> SeatTemplate : seatTemplateId
  Trip --> Schedule : scheduleId
  Trip --> Trip : returnTripLinked
  Trip --> User : cancelledBy
  Trip --> User : rescheduledBy
  class UserCouponUsage {
    +ObjectId (User) userId
    +ObjectId (Coupon) couponId
    +String couponCode
    +ObjectId (Booking) bookingId
    +String ticketId
    +Date usedAt
    +Number discountAmount
    +Number originalAmount
    +Number finalAmount
    +String status
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  UserCouponUsage --> User : userId
  UserCouponUsage --> Coupon : couponId
  UserCouponUsage --> Booking : bookingId
  class UserDeviceInfo {
    +ObjectId (User) userId
    +String token
    +String userType
    +String os
    +String osVersion
    +String deviceModel
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  UserDeviceInfo --> User : userId
  class User {
    +String name
    +String email
    +String phone
    +String address
    +String password
    +String profilePicture
    +String gender
    +String role
    +Array[String] roles
    +Boolean isVerified
    +String status
    +Boolean phoneVerified
    +Number yatrapoints
    +String referralCode
    +ObjectId (User) referredBy
    +Number totalReferrals
    +Boolean smMoneyEnabled
    +Boolean welcomeOfferUsed
    +Number lifetimeSmEarned
    +Number lifetimeSmSpent
    +Date lastLoginAt
    +Number failedLoginAttempts
    +Date lockedUntil
    +Date deletedAt
    +String suspensionReason
    +Date suspendedAt
    +ObjectId (SuperAdmin) statusChangedBy
    +Boolean forcePasswordChange
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  User --> User : referredBy
  User --> SuperAdmin : statusChangedBy
  class Wallet {
    +ObjectId (User) userId
    +Number balance
    +Number legacyBalance
    +String currency
    +String status
    +String pin
    +Boolean isPinSet
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  Wallet --> User : userId
  class WalletTransaction {
    +ObjectId (Wallet) walletId
    +ObjectId (User) userId
    +Number amount
    +String type
    +String purpose
    +Number balanceBefore
    +Number balanceAfter
    +String referenceType
    +ObjectId referenceId
    +String status
    +String remarks
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  WalletTransaction --> Wallet : walletId
  WalletTransaction --> User : userId
  class YatraPointsHistory {
    +ObjectId (User) userId
    +String type
    +Number points
    +Number balanceBefore
    +Number balanceAfter
    +ObjectId (Booking) bookingId
    +ObjectId (busschedules) scheduleId
    +String ticketId
    +String description
    +Mixed meta
    +ObjectId _id
    +Date createdAt
    +Date updatedAt
  }

  YatraPointsHistory --> User : userId
  YatraPointsHistory --> Booking : bookingId
  YatraPointsHistory --> busschedules : scheduleId
```
