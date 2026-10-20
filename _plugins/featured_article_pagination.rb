require "jekyll-paginate"

module Jekyll
  module Paginate
    class Pagination
      # Select the same featured post as the home layout before counting pages.
      def paginate(site, page)
        all_posts = site.site_payload["site"]["posts"]
        featured_post = all_posts.find { |post| post["url"] == site.config["featured_article"] } || all_posts.first
        all_posts = all_posts.reject { |post| post["hidden"] || post == featured_post }
        pages = Pager.calculate_pages(all_posts, site.config["paginate"].to_i)

        (1..pages).each do |number|
          pager = Pager.new(site, number, all_posts, pages)
          if number == 1
            page.pager = pager
          else
            paginated_page = Page.new(site, site.source, page.dir, page.name)
            paginated_page.pager = pager
            paginated_page.dir = Pager.paginate_path(site, number)
            site.pages << paginated_page
          end
        end
      end
    end
  end
end
