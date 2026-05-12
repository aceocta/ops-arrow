using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ScratchCard.Infrastructure.Persistence;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        var connectionString = Environment.GetEnvironmentVariable("DefaultConnection")
            ?? "Server=localhost;Database=scratch-card-uat;Trusted_Connection=True;Encrypt=True;TrustServerCertificate=True;";
            // ?? "Data Source=sql-ops-arrow.database.windows.net;Initial Catalog=sql-ops-arrow-uat;Persist Security Info=True;User ID=sysadmin;Password=Strange2025!;MultipleActiveResultSets=False;TrustServerCertificate=True;";

        optionsBuilder.UseSqlServer(connectionString);
        return new ApplicationDbContext(optionsBuilder.Options);
    }
}
